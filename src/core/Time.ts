// Fixed-timestep accumulator: turns variable frame times into a whole number of
// fixed gameplay steps, so controls and physics feel the same at any frame rate.

export class FixedStep {
  private accumulator = 0;

  constructor(
    readonly step: number,
    private readonly maxFrameDt: number,
  ) {}

  /** Adds frame time and returns how many fixed steps to run now. */
  advance(frameDt: number): number {
    this.accumulator += Math.min(Math.max(frameDt, 0), this.maxFrameDt);
    const steps = Math.floor(this.accumulator / this.step);
    this.accumulator -= steps * this.step;
    return steps;
  }

  /** 0..1 – how far we are between the last fixed step and the next. Use for render interpolation. */
  get alpha(): number {
    return this.accumulator / this.step;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
