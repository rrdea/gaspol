// Steering towards the track: aims at a point `lookahead` metres further along the
// centre line (plus an optional lateral line offset). Drives the dev/test autopilot now
// and the AI riders in M5. Pure.

import { clamp, wrapAngle } from '../core/math';
import type { TrackPath } from '../track/TrackPath';

export interface SteerResult {
  /** -1..1 steering input. */
  steer: number;
  /** Projection index, pass back as the next hint. */
  index: number;
  /** Current distance along the track. */
  s: number;
}

export function steerToward(
  path: TrackPath,
  x: number,
  z: number,
  heading: number,
  lookahead: number,
  gain: number,
  lineOffset = 0,
  hint?: number,
): SteerResult {
  const proj = path.project(x, z, hint);
  const target = path.sampleAt(proj.s + lookahead);
  const right = path.rightAt(proj.s + lookahead);
  const tx = target.x + right.x * lineOffset;
  const tz = target.z + right.z * lineOffset;
  const desired = Math.atan2(tx - x, tz - z);
  return { steer: clamp(wrapAngle(desired - heading) * gain, -1, 1), index: proj.index, s: proj.s };
}
