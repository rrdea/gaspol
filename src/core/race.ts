// Race timing: countdown → racing → finished, and time formatting. Pure.

export type RacePhase = 'countdown' | 'racing' | 'finished';

export type ClockEvent = { kind: 'tick'; n: number } | { kind: 'go' } | null;

export class RaceClock {
  phase: RacePhase = 'countdown';
  /** Seconds left in the countdown. */
  countdownLeft: number;
  /** Seconds since the start signal (frozen at the finish). */
  elapsed = 0;

  constructor(private readonly countdownSeconds: number) {
    this.countdownLeft = countdownSeconds;
  }

  /** The number shown when the countdown starts (e.g. 3). */
  get firstTick(): number {
    return Math.ceil(this.countdownSeconds);
  }

  step(dt: number): ClockEvent {
    if (this.phase === 'racing') {
      this.elapsed += dt;
      return null;
    }
    if (this.phase !== 'countdown') return null;
    const before = Math.ceil(this.countdownLeft);
    this.countdownLeft -= dt;
    if (this.countdownLeft <= 0) {
      this.phase = 'racing';
      this.elapsed = -this.countdownLeft;
      this.countdownLeft = 0;
      return { kind: 'go' };
    }
    const after = Math.ceil(this.countdownLeft);
    return after < before ? { kind: 'tick', n: after } : null;
  }

  finish(): void {
    this.phase = 'finished';
  }

  reset(): void {
    this.phase = 'countdown';
    this.countdownLeft = this.countdownSeconds;
    this.elapsed = 0;
  }
}

/** m:ss.cc */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 10));
  const cs = total % 100;
  const secs = Math.floor(total / 100) % 60;
  const mins = Math.floor(total / 6000);
  return `${mins}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
