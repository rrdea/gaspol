// Landing check: how far the rider's orientation is from the ground at touchdown,
// and whether that is a clean landing, a sloppy one, or a crash. Pure functions.

import type { Config } from '../config';
import { offFromMultiple } from '../core/math';

export type LandingQuality = 'clean' | 'sloppy' | 'crash';

interface V3 {
  x: number;
  y: number;
  z: number;
}

/**
 * The rider's "up" vector for a travel heading and a pitch (positive = nose up /
 * rotating backwards, as in a backflip).
 */
export function riderUp(heading: number, pitch: number): V3 {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  // up' = up * cos(p) - forward * sin(p)
  return { x: -fx * s, y: c, z: -fz * s };
}

/** Landing error in radians: the worse of body tilt vs the ground, and spin off a multiple of 180°. */
export function landingError(heading: number, pitch: number, yaw: number, normal: V3): number {
  const up = riderUp(heading, pitch);
  const dot = up.x * normal.x + up.y * normal.y + up.z * normal.z;
  const tilt = Math.acos(Math.min(1, Math.max(-1, dot)));
  const spin = Math.abs(offFromMultiple(yaw, Math.PI));
  return Math.max(tilt, spin);
}

export function classifyLanding(error: number, cfg: Config['landing']): LandingQuality {
  if (error < cfg.cleanLandingAngle) return 'clean';
  if (error < cfg.crashAngle) return 'sloppy';
  return 'crash';
}
