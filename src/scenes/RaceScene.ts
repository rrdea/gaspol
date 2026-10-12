// The riding scene: test hill with ramps and rocks, the rider with tricks and crashes,
// chase camera, lights, sky/fog and the HUD. Runs gameplay on fixed steps and renders
// with interpolation.

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
import { Terrain } from '../track/Terrain';
import { Props } from '../track/Props';
import { ramps } from '../track/m2Layout';
import { trailCenterX } from '../track/terrainShape';
import { RiderController } from '../rider/RiderController';
import { TrickSystem } from '../rider/TrickSystem';
import { CrashSystem } from '../rider/CrashSystem';
import { RiderVisual } from '../rider/RiderVisual';
import { ChaseCamera } from '../camera/ChaseCamera';
import { Hud } from '../ui/Hud';

export class RaceScene {
  readonly scene: Scene;
  readonly events = new Emitter<GameEvents>();
  private readonly terrain: Terrain;
  private readonly props: Props;
  readonly rider: RiderController;
  private readonly tricks: TrickSystem;
  private readonly crashes: CrashSystem;
  private readonly visual: RiderVisual;
  private readonly chase: ChaseCamera;
  private readonly hud: Hud;

  constructor(
    private readonly engine: AbstractEngine,
    havok: HavokPhysicsWithBindings,
    hudRoot: HTMLElement,
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

    this.terrain = new Terrain(scene, config.terrain);
    this.props = new Props(scene, config.terrain);
    const height = (x: number, z: number) => this.terrain.height(x, z);
    this.rider = new RiderController(scene, height);
    this.tricks = new TrickSystem(this.events);
    const rampZones = ramps.map((r) => ({ from: r.z - config.crash.rampClearance, to: r.z + r.length }));
    this.crashes = new CrashSystem(this.events, this.props.obstacles, height, rampZones);
    this.visual = new RiderVisual(scene);
    this.chase = new ChaseCamera(scene, height);
    this.hud = new Hud(hudRoot);

    this.visual.update(this.rider, 1, 1);
    this.chase.snap(this.rider, this.visual.root);
    this.listen();
  }

  fixedUpdate(input: Input, dt: number): void {
    if (input.wasPressed('debug')) this.hud.toggleDebug();
    const ev = this.rider.fixedUpdate(input, dt);
    if (ev.jumped) this.events.emit('jumped', {});
    if (ev.tookOff) this.events.emit('tookOff', {});
    this.tricks.fixedUpdate(this.rider, ev, dt);
    this.crashes.fixedUpdate(this.rider, input, ev, dt);
  }

  /** Dev helper: put the rider `lead` m before ramp `index`, aimed at it, rolling at `speed` m/s. */
  debugApproachRamp(index: number, speed = 18, lead = 30): void {
    const ramp = ramps[index];
    const tx = trailCenterX(ramp.z, config.terrain) + ramp.offset;
    const z = ramp.z - lead;
    const x = trailCenterX(z, config.terrain) + ramp.offset;
    this.rider.placeAt(x, z, Math.atan2(tx - x, lead), speed);
    this.events.emit('respawned', { reason: 'manual' });
  }

  private listen(): void {
    const { events, hud } = this;
    events.on('respawned', () => {
      this.visual.reset();
      this.visual.update(this.rider, 1, 1);
      this.chase.snap(this.rider, this.visual.root);
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
    this.hud.update(
      {
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
    this.hud.dispose();
    this.chase.dispose();
    this.visual.dispose();
    this.props.dispose();
    this.terrain.dispose();
    this.scene.dispose();
  }
}
