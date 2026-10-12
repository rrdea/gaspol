// The riding scene. M1: a test hill, the rider, chase camera, lights, sky/fog and the
// debug HUD. Runs gameplay on fixed steps and renders with interpolation.

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
import { slopeHeight } from '../track/terrainShape';
import { RiderController } from '../rider/RiderController';
import { RiderVisual } from '../rider/RiderVisual';
import { ChaseCamera } from '../camera/ChaseCamera';
import { Hud } from '../ui/Hud';

export class RaceScene {
  readonly scene: Scene;
  readonly events = new Emitter<GameEvents>();
  private readonly terrain: Terrain;
  private readonly rider: RiderController;
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
    const terrainCfg = config.terrain;
    this.rider = new RiderController(
      scene,
      (x, z) => this.terrain.height(x, z),
      (z) => slopeHeight(z, terrainCfg) - 40,
      this.events,
    );
    this.visual = new RiderVisual(scene);
    this.chase = new ChaseCamera(scene, (x, z) => this.terrain.height(x, z));
    this.hud = new Hud(hudRoot);

    this.visual.update(this.rider, 1, 1);
    this.chase.snap(this.rider, this.visual.root);
    this.events.on('respawned', () => {
      this.visual.update(this.rider, 1, 1);
      this.chase.snap(this.rider, this.visual.root);
    });
  }

  fixedUpdate(input: Input, dt: number): void {
    if (input.wasPressed('debug')) this.hud.toggleDebug();
    this.rider.fixedUpdate(input, dt);
  }

  render(alpha: number, frameDt: number): void {
    this.visual.update(this.rider, alpha, frameDt);
    this.chase.update(this.rider, this.visual.root, frameDt);
    const s = this.rider.state;
    this.hud.update(
      {
        fps: this.engine.getFps(),
        speedKmh: this.rider.speedKmh,
        grounded: s.grounded,
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
    this.terrain.dispose();
    this.scene.dispose();
  }
}
