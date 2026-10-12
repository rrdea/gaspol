// Trick detection, scoring and combos. Pure: input is the rotation done in the air,
// airtime and grabs; output is a list of named tricks and points.

import type { Config } from '../config';
import type { LandingQuality } from './landing';

type TrickConfig = Config['tricks'];

export type GrabName = 'Superman' | 'No-Hander' | 'Can-Can';

export interface GrabRecord {
  name: GrabName;
  /** Total seconds this grab was held during the jump. */
  time: number;
}

export interface AirStats {
  /** Pitch rotated since take-off, radians. Positive = backwards. */
  pitch: number;
  /** Yaw rotated since take-off, radians. */
  yaw: number;
  airTime: number;
  grabs: readonly GrabRecord[];
}

export interface Trick {
  name: string;
  points: number;
}

const MULTI = ['', '', 'Double ', 'Triple ', 'Quad '];

function multiName(n: number): string {
  return MULTI[n] ?? `${n}x `;
}

export function detectTricks(air: AirStats, cfg: TrickConfig): Trick[] {
  const tricks: Trick[] = [];

  const flips = Math.floor((Math.abs(air.pitch) + cfg.flipTolerance) / (Math.PI * 2));
  if (flips > 0) {
    const kind = air.pitch > 0 ? 'Backflip' : 'Frontflip';
    tricks.push({ name: `${multiName(flips)}${kind}`, points: flips * cfg.flipPoints });
  }

  const halfSpins = Math.floor((Math.abs(air.yaw) + cfg.spinTolerance) / Math.PI);
  if (halfSpins > 0) {
    tricks.push({ name: `${halfSpins * 180}`, points: halfSpins * cfg.spinPointsPer180 });
  }

  for (const g of air.grabs) {
    if (g.time < cfg.minGrabTime) continue;
    const extra = (g.time - cfg.minGrabTime) * cfg.grabPointsPerSecond;
    tricks.push({ name: g.name, points: Math.round(cfg.grabPoints + extra) });
  }
  return tricks;
}

/** Total points for a landing: base points × airtime bonus × combo multiplier. */
export function scoreTricks(tricks: readonly Trick[], airTime: number, multiplier: number, cfg: TrickConfig): number {
  const base = tricks.reduce((sum, t) => sum + t.points, 0);
  return Math.round(base * (1 + airTime * cfg.airtimeBonus) * multiplier);
}

export interface LandResult {
  multiplier: number;
  points: number;
  comboTotal: number;
}

/**
 * Tracks the combo multiplier. Clean trick landings within `comboWindow` seconds of
 * ground time keep the combo going; sloppy landings and crashes end it.
 */
export class ComboTracker {
  multiplier = 1;
  comboTotal = 0;
  private groundTime = 0;
  private active = false;

  constructor(private readonly cfg: TrickConfig) {}

  /** Advance time. Returns the finished combo total if the combo just expired. */
  update(dt: number, grounded: boolean): number | null {
    if (!grounded || !this.active) return null;
    this.groundTime += dt;
    if (this.groundTime > this.cfg.comboWindow) return this.end();
    return null;
  }

  /** Register a landing. `basePoints` are the points before the multiplier. */
  land(quality: LandingQuality, basePoints: number): LandResult {
    if (quality === 'crash') {
      this.reset();
      return { multiplier: 1, points: 0, comboTotal: 0 };
    }
    if (basePoints <= 0) {
      // No trick: the window just keeps running.
      return { multiplier: this.multiplier, points: 0, comboTotal: this.comboTotal };
    }
    if (quality === 'sloppy') {
      this.reset();
      return { multiplier: 1, points: basePoints, comboTotal: basePoints };
    }
    if (this.active) {
      this.multiplier = Math.min(this.multiplier + this.cfg.comboStep, this.cfg.maxMultiplier);
    } else {
      this.multiplier = 1;
      this.comboTotal = 0;
      this.active = true;
    }
    const points = Math.round(basePoints * this.multiplier);
    this.comboTotal += points;
    this.groundTime = 0;
    return { multiplier: this.multiplier, points, comboTotal: this.comboTotal };
  }

  /** Ends the combo (e.g. crash). Returns the total that was banked. */
  end(): number {
    const total = this.comboTotal;
    this.reset();
    return total;
  }

  private reset(): void {
    this.multiplier = 1;
    this.comboTotal = 0;
    this.groundTime = 0;
    this.active = false;
  }
}
