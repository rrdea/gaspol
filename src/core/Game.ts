// Owns the Babylon engine, Havok init, the active scene and the main loop. Gameplay
// runs on a fixed 60 Hz step; rendering happens once per frame with interpolation.

import { Engine } from '@babylonjs/core/Engines/engine';
import HavokPhysics from '@babylonjs/havok';
import { config } from '../config';
import { RaceScene } from '../scenes/RaceScene';
import { Input } from './Input';
import { FixedStep } from './Time';

export class Game {
  private readonly engine: Engine;
  private readonly input = new Input();
  private readonly time = new FixedStep(config.physics.fixedDt, config.physics.maxFrameDt);
  private race: RaceScene | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hudRoot: HTMLElement,
  ) {
    this.engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false });
    window.addEventListener('resize', this.onResize);
  }

  async start(): Promise<void> {
    const havok = await HavokPhysics();
    this.race = new RaceScene(this.engine, havok, this.hudRoot);
    await this.race.scene.whenReadyAsync();
    this.canvas.focus();

    this.engine.runRenderLoop(() => {
      const race = this.race;
      if (!race) return;
      const frameDt = this.engine.getDeltaTime() / 1000;
      const steps = this.time.advance(frameDt);
      for (let i = 0; i < steps; i++) {
        race.fixedUpdate(this.input, this.time.step);
        this.input.endStep();
      }
      race.render(this.time.alpha, Math.min(frameDt, config.physics.maxFrameDt));
    });
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.race?.dispose();
    this.race = null;
    this.input.dispose();
    this.engine.dispose();
  }

  private readonly onResize = (): void => {
    this.engine.resize();
  };
}
