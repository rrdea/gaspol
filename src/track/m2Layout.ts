// Prop placements for the M2 test hill: kicker ramps of growing size and rocks along
// the trail. Positions are distance down the hill (z) plus an offset from the trail
// centre. Replaced by per-track TrackData in M3.

import type { TerrainConfig } from '../config';

export interface RampPlacement {
  z: number;
  /** Offset from the trail centre (m). */
  offset: number;
  width: number;
  /** Length of the curved kicker. */
  length: number;
  /** Lip height above the ground. */
  height: number;
  /** Flat deck after the lip (0 = a sharp lip, which launches best). */
  deck: number;
}

export interface RockPlacement {
  z: number;
  offset: number;
  radius: number;
  /** 0..1 seed for shape/rotation variation. */
  variant: number;
}

export const ramps: readonly RampPlacement[] = [
  { z: 60, offset: 0, width: 6, length: 6, height: 1.2, deck: 0 },
  { z: 170, offset: -3, width: 6, length: 7, height: 1.8, deck: 0 },
  { z: 300, offset: 2, width: 7, length: 8, height: 2.3, deck: 0 },
  { z: 450, offset: 0, width: 7, length: 9, height: 2.7, deck: 0 },
  { z: 640, offset: -2, width: 8, length: 10, height: 3.2, deck: 0 },
  { z: 860, offset: 3, width: 8, length: 10, height: 3.2, deck: 0 },
];

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rocks on the trail edges plus the odd one mid-trail, kept clear of ramps and their landings. */
export function rockLayout(cfg: TerrainConfig): RockPlacement[] {
  const rand = rng(cfg.seed + 99);
  const rocks: RockPlacement[] = [];
  for (let z = 110; z < cfg.length - 60; z += 22 + rand() * 30) {
    if (ramps.some((r) => z > r.z - 40 && z < r.z + r.length + 45)) continue;
    const midTrail = rand() < 0.25;
    const side = rand() < 0.5 ? -1 : 1;
    const offset = midTrail
      ? (rand() - 0.5) * cfg.trailHalfWidth
      : side * (cfg.trailHalfWidth - 3 + rand() * 6);
    rocks.push({ z, offset, radius: 0.7 + rand() * 1.1, variant: rand() });
  }
  return rocks;
}
