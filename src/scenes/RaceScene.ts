// A race on one track: builds the spline terrain, props and checkpoint gates, then runs
// countdown → racing → finished with the rider, tricks, crashes, chase camera, HUD and
// results screen. Gameplay runs on fixed steps and renders with interpolation.

import { Scene } from '@babylonjs/core/scene';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import type { HavokPhysicsWithBindings } from '@babylonjs/havok';
import { config } from '../config';
import { Emitter, type GameEvents } from '../core/Events';
import type { Input } from '../core/Input';
import { RaceClock } from '../core/race';
import { browserStorage, loadSave, recordRun, writeSave, type SaveData } from '../core/Save';
import { TrackPath } from '../track/TrackPath';
import { TrackTerrain } from '../track/TrackTerrain';
import { TrackBuilder } from '../track/TrackBuilder';
import { Props } from '../track/Props';
import { Checkpoints } from '../track/Checkpoints';
import { bukitHijau, gatePositions, type TrackDef } from '../track/TrackData';
import { RiderController } from '../rider/RiderController';
import { TrickSystem } from '../rider/TrickSystem';
import { CrashSystem } from '../rider/CrashSystem';
import { RiderVisual } from '../rider/RiderVisual';
import { ChaseCamera } from '../camera/ChaseCamera';
import { Hud } from '../ui/Hud';
import { Results } from '../ui/Results';

export class RaceScene {
  readonly scene: Scene;
  readonly events = new Emitter<GameEvents>();
  readonly path: TrackPath;
  readonly terrain: TrackTerrain;
  readonly rider: RiderController;
  /** Dev/test: let the autopilot ride instead of the keyboard once the race starts. */
  autopilot = false;

  private readonly builder: TrackBuilder;
  private readonly props: Props;
  private readonly checkpoints: Checkpoints;
  private readonly tricks: TrickSystem;
  private readonly crashes: CrashSystem;
  private readonly visual: RiderVisual;
  private readonly chase: ChaseCamera;
  private readonly hud: Hud;
  private readonly results: Results;
  private readonly clock = new RaceClock(config.race.countdownSeconds);
  private save: SaveData;

  private projHint: number | undefined;
  /** Track distance at the previous step; null right after a respawn (no gate crossing). */
  private prevS: number | null = null;
  private resultsTimer = -1;

  constructor(
    private readonly engine: AbstractEngine,
    havok: HavokPhysicsWithBindings,
    hudRoot: HTMLElement,
    overlayRoot: HTMLElement,
    private readonly def: TrackDef = bukitHijau,
  ) {
    const scene = new Scene(engine);
    this.scene = scene;
    const [r, g, b] = config.world.skyColor;
    scene.clearColor = new Color4(r, g, b, 1);
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = new Color3(r, g, b);
    scene.fogStart = config.world.fogStart;
    scene.fogEnd = config.world.fogEnd;
    scene.enablePhysics(new Vector3(0, -config.physics.gravity, 0), new HavokPlugin(false, havok));
    // Gameplay uses its own fixed-step controller; Havok is stepped with our fixed dt.
    scene.getPhysicsEngine()?.setTimeStep(config.physics.fixedDt);

    const hemi = new HemisphericLight('sky', new Vector3(0.2, 1, -0.3), scene);
    hemi.intensity = 0.75;
    hemi.groundColor = new Color3(0.35, 0.3, 0.25);
    const sun = new DirectionalLight('sun', new Vector3(-0.4, -1, 0.5), scene);
    sun.intensity = 0.7;

    this.path = new TrackPath(def.points, config.track.sampleStep);
    this.terrain = new TrackTerrain(this.path, config.track, def.startS);
    const finishS = this.path.length - config.track.finishRunout;
    this.builder = new TrackBuilder(scene, this.terrain, config.track);
    this.props = new Props(scene, def, this.terrain, finishS);
    this.checkpoints = new Checkpoints(scene, this.terrain, gatePositions(def, finishS), def.startS);

    const height = (x: number, z: number) => this.terrain.heightAt(x, z);
    this.rider = new RiderController(scene, height, this.path);
    this.tricks = new TrickSystem(this.events);
    this.crashes = new CrashSystem(this.events, this.props.obstacles, this.path, () => this.checkpoints.tracker.lastPassedS);
    this.visual = new RiderVisual(scene);
    this.chase = new ChaseCamera(scene, height);
    this.hud = new Hud(hudRoot);
    this.results = new Results(overlayRoot, () => this.reset());
    this.save = loadSave(browserStorage());

    this.listen();
    this.reset();
  }

  /** Back to the start line and a fresh countdown (Retry). */
  reset(): void {
    this.results.hide();
    this.resultsTimer = -1;
    this.clock.reset();
    this.checkpoints.tracker.reset();
    this.tricks.reset();
    const c = this.path.sampleAt(this.def.startS);
    this.rider.placeAt(c.x, c.z, c.heading, 0);
    this.rider.mode = 'frozen';
    this.prevS = null;
    this.projHint = undefined;
    this.snapView();
    this.hud.showCountdown(String(this.clock.firstTick), 0.9);
    this.events.emit('countdown', { n: this.clock.firstTick });
  }

  fixedUpdate(input: Input, dt: number): void {
    if (input.wasPressed('debug')) this.hud.toggleDebug();
    if (this.results.shown) {
      if (input.wasPressed('confirm')) this.reset();
      return;
    }
    this.stepClock(dt);

    const ev = this.rider.fixedUpdate(input, dt);
    if (ev.jumped) this.events.emit('jumped', {});
    if (ev.tookOff) this.events.emit('tookOff', {});
    this.tricks.fixedUpdate(this.rider, ev, dt);

    const pos = this.rider.state.pos;
    const proj = this.path.project(pos.x, pos.z, this.projHint);
    this.projHint = proj.index;
    this.crashes.fixedUpdate(this.rider, input, ev, proj, dt);
    if (this.prevS === null) {
      // Just respawned/reset: start tracking from here, no gate crossing this step.
      const now = this.rider.state.pos;
      this.prevS = this.path.project(now.x, now.z).s;
    } else {
      this.updateCheckpoints(this.prevS, proj.s, proj.lateral);
      this.prevS = proj.s;
    }

    if (this.resultsTimer >= 0) {
      this.resultsTimer += dt;
      if (this.resultsTimer >= config.race.resultsDelay) this.finishRace();
    }
  }

  /** Dev helper: put the rider `lead` m before ramp `index`, aimed at it, rolling at `speed` m/s. */
  debugApproachRamp(index: number, speed = 18, lead = 30): void {
    const ramp = this.def.ramps[index];
    const at = (s: number) => {
      const c = this.path.sampleAt(s);
      return { x: c.x + Math.cos(c.heading) * ramp.offset, z: c.z - Math.sin(c.heading) * ramp.offset };
    };
    const from = at(ramp.s - lead);
    const to = at(ramp.s);
    this.rider.placeAt(from.x, from.z, Math.atan2(to.x - from.x, to.z - from.z), speed);
    this.rider.mode = 'player';
    this.events.emit('respawned', { reason: 'manual' });
  }

  private stepClock(dt: number): void {
    const e = this.clock.step(dt);
    if (!e) return;
    if (e.kind === 'tick') {
      this.hud.showCountdown(String(e.n), 0.9);
      this.events.emit('countdown', { n: e.n });
    } else {
      this.hud.showCountdown('GAS POL!', config.race.goTextTime);
      this.rider.mode = this.autopilot ? 'autopilot' : 'player';
      this.events.emit('raceStarted', {});
    }
  }

  private updateCheckpoints(prevS: number, s: number, lateral: number): void {
    if (this.clock.phase !== 'racing' || this.rider.state.phase === 'crashed') return;
    const tracker = this.checkpoints.tracker;
    const result = tracker.update(prevS, s, lateral);
    if (!result) return;
    const timeMs = this.clock.elapsed * 1000;
    if (result === 'checkpoint') {
      this.hud.showSplit(tracker.passed, tracker.total, timeMs);
      this.events.emit('checkpoint', { index: tracker.passed, total: tracker.total, timeMs });
      return;
    }
    // Finish line: stop the clock, coast to a stop, results shortly after.
    this.clock.finish();
    this.rider.mode = 'coast';
    this.hud.showCountdown('FINISH!', config.race.resultsDelay);
    this.resultsTimer = 0;
  }

  private finishRace(): void {
    this.resultsTimer = -1;
    const timeMs = Math.round(this.clock.elapsed * 1000);
    const trickScore = this.tricks.score;
    const run = recordRun(this.save, this.def.id, timeMs, trickScore);
    this.save = run.save;
    writeSave(browserStorage(), this.save);
    const result = {
      trackName: this.def.name,
      timeMs,
      trickScore,
      bestTimeMs: this.save.bestTimes[this.def.id] ?? timeMs,
      bestTrickScore: this.save.bestTrickScores[this.def.id] ?? trickScore,
      newBestTime: run.newBestTime,
      newBestTricks: run.newBestTricks,
    };
    this.results.show(result);
    this.events.emit('raceFinished', result);
  }

  private snapView(): void {
    this.visual.reset();
    this.visual.update(this.rider, 1, 1);
    this.chase.snap(this.rider, this.visual.root);
  }

  private listen(): void {
    const { events, hud } = this;
    events.on('respawned', () => {
      this.prevS = null;
      this.projHint = undefined;
      this.snapView();
    });
    events.on('crashed', () => {
      this.tricks.onCrash();
      hud.showMessage('WIPEOUT!', 'crash');
    });
    events.on('landed', ({ quality }) => {
      if (quality === 'sloppy') hud.showMessage('SLOPPY', 'sloppy');
    });
    events.on('trickLanded', (t) => hud.showTrick(t.names, t.points, t.multiplier, t.quality === 'sloppy'));
    events.on('comboEnded', ({ total }) => {
      if (total > 0) hud.showMessage(`COMBO ${total.toLocaleString()}`, 'info');
    });
  }

  render(alpha: number, frameDt: number): void {
    this.visual.update(this.rider, alpha, frameDt);
    this.chase.update(this.rider, this.visual.root, frameDt);
    const s = this.rider.state;
    const tracker = this.checkpoints.tracker;
    this.hud.update(
      {
        timeMs: this.clock.elapsed * 1000,
        checkpoints: tracker.passed,
        checkpointTotal: tracker.total,
        speedKmh: this.rider.speedKmh,
        score: this.tricks.score,
        multiplier: this.tricks.multiplier,
        charge: s.jumpCharge / config.jump.maxChargeTime,
      },
      {
        fps: this.engine.getFps(),
        speedKmh: this.rider.speedKmh,
        phase: s.phase,
        airTime: s.airTime,
        headingDeg: (s.heading * 180) / Math.PI,
        x: s.pos.x,
        y: s.pos.y,
        z: s.pos.z,
      },
      frameDt,
    );
    this.scene.render();
  }

  dispose(): void {
    this.events.clear();
    this.results.dispose();
    this.hud.dispose();
    this.chase.dispose();
    this.visual.dispose();
    this.checkpoints.dispose();
    this.props.dispose();
    this.builder.dispose();
    this.scene.dispose();
  }
}
