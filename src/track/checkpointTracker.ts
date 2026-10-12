// Ordered checkpoint gates along the track. A gate counts only if it is the next one and
// the rider crosses its distance going forward, within the gate width. The last gate is
// the finish line. Pure.

export type GateResult = 'checkpoint' | 'finish' | null;

export class CheckpointTracker {
  /** Number of gates passed so far. */
  passed = 0;

  constructor(
    readonly gates: readonly number[],
    private readonly halfWidth: number,
    private readonly startS: number,
  ) {}

  get total(): number {
    return this.gates.length;
  }

  get finished(): boolean {
    return this.passed >= this.gates.length;
  }

  /** Distance of the last gate passed (or the start), used for respawning. */
  get lastPassedS(): number {
    return this.passed === 0 ? this.startS : this.gates[this.passed - 1];
  }

  update(prevS: number, s: number, lateral: number): GateResult {
    if (this.finished) return null;
    const gate = this.gates[this.passed];
    if (prevS < gate && s >= gate && Math.abs(lateral) <= this.halfWidth) {
      this.passed++;
      return this.finished ? 'finish' : 'checkpoint';
    }
    return null;
  }

  reset(): void {
    this.passed = 0;
  }
}
