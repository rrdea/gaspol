// Track definitions (control points, start, checkpoints, ramps, rock/tree generation)
// and the seeded prop layout derived from them. Data only: TrackBuilder, Props and
// Checkpoints turn it into the scene.

import type { ControlPoint } from './TrackPath';

export interface RampDef {
  /** Distance along the track of the ramp's foot. */
  s: number;
  /** Offset from the centre line (m, positive = right). */
  offset: number;
  width: number;
  /** Length of the curved kicker. */
  length: number;
  /** Lip height above the ground. */
  height: number;
  /** Flat deck after the lip (0 = a sharp lip, which launches best). */
  deck: number;
}

export interface ScatterDef {
  count: number;
  /** Lateral band (absolute distance from the centre line) to place in. */
  minLateral: number;
  maxLateral: number;
  minRadius: number;
  maxRadius: number;
}

export interface TrackDef {
  id: string;
  name: string;
  points: readonly ControlPoint[];
  /** Start line distance along the track. */
  startS: number;
  /** Distance between checkpoint gates. */
  checkpointSpacing: number;
  ramps: readonly RampDef[];
  /** Rocks mostly at the trail edges, some on the trail. */
  rocks: ScatterDef & { onTrailChance: number };
  /** Trees off the trail. */
  trees: ScatterDef;
  seed: number;
}

/** Bukit Hijau ("green hill"): wide, easy, few obstacles. Tutorial-style. */
export const bukitHijau: TrackDef = {
  id: 'bukit-hijau',
  name: 'Bukit Hijau',
  points: [
    { x: 0, z: -40, grade: 0.08 },
    { x: 0, z: 60, grade: 0.14 },
    { x: 25, z: 240, grade: 0.22 },
    { x: -30, z: 450, grade: 0.27 },
    { x: 10, z: 650, grade: 0.26 },
    { x: 70, z: 850, grade: 0.25 },
    { x: 40, z: 1050, grade: 0.27 },
    { x: -25, z: 1250, grade: 0.22 },
    { x: 0, z: 1450, grade: 0.18 },
    { x: 30, z: 1650, grade: 0.15 },
    { x: 30, z: 1780, grade: 0.1 },
  ],
  startS: 40,
  checkpointSpacing: 140,
  // Between checkpoint gates (every 140 m from s = 40) so respawns never land on a ramp.
  ramps: [
    { s: 250, offset: 0, width: 7, length: 6, height: 1.2, deck: 0 },
    { s: 390, offset: -3, width: 7, length: 7, height: 1.8, deck: 0 },
    { s: 670, offset: 3, width: 7, length: 8, height: 2.3, deck: 0 },
    { s: 810, offset: 0, width: 8, length: 9, height: 2.7, deck: 0 },
    { s: 1090, offset: -3, width: 8, length: 10, height: 3.2, deck: 0 },
    { s: 1370, offset: 2, width: 8, length: 10, height: 3.0, deck: 0 },
  ],
  rocks: { count: 10, minLateral: 10, maxLateral: 20, minRadius: 0.7, maxRadius: 1.6, onTrailChance: 0.25 },
  trees: { count: 520, minLateral: 21, maxLateral: 70, minRadius: 0.9, maxRadius: 1.5 },
  seed: 2024,
};

export interface Placement {
  s: number;
  offset: number;
  radius: number;
  /** 0..1 seed for shape/rotation/size variation. */
  variant: number;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Space kept clear before a ramp foot and after its lip (run-up and landing). */
const RAMP_CLEAR_BEFORE = 40;
const RAMP_CLEAR_AFTER = 45;

function nearRamp(def: TrackDef, s: number): boolean {
  return def.ramps.some((r) => s > r.s - RAMP_CLEAR_BEFORE && s < r.s + r.length + RAMP_CLEAR_AFTER);
}

/** Rocks between the start and the finish, kept off ramp run-ups and landings. */
export function rockLayout(def: TrackDef, finishS: number): Placement[] {
  const rand = rng(def.seed + 1);
  const r = def.rocks;
  const out: Placement[] = [];
  for (let tries = 0; out.length < r.count && tries < r.count * 20; tries++) {
    const s = def.startS + 80 + rand() * (finishS - def.startS - 100);
    if (nearRamp(def, s)) continue;
    const side = rand() < 0.5 ? -1 : 1;
    const lateral = rand() < r.onTrailChance ? (rand() - 0.5) * r.minLateral : side * (r.minLateral + rand() * (r.maxLateral - r.minLateral));
    out.push({ s, offset: lateral, radius: r.minRadius + rand() * (r.maxRadius - r.minRadius), variant: rand() });
  }
  return out;
}

/** Trees along both sides of the whole track, off the trail. */
export function treeLayout(def: TrackDef, length: number): Placement[] {
  const rand = rng(def.seed + 2);
  const t = def.trees;
  const out: Placement[] = [];
  for (let i = 0; i < t.count; i++) {
    const s = rand() * length;
    const side = rand() < 0.5 ? -1 : 1;
    // Bias towards the trail edge so the run feels lined with trees.
    const band = Math.pow(rand(), 1.6);
    out.push({
      s,
      offset: side * (t.minLateral + band * (t.maxLateral - t.minLateral)),
      radius: t.minRadius + rand() * (t.maxRadius - t.minRadius),
      variant: rand(),
    });
  }
  return out;
}

/** Checkpoint gate positions: every `checkpointSpacing` from the start, ending at the finish. */
export function gatePositions(def: TrackDef, finishS: number): number[] {
  const gates: number[] = [];
  for (let s = def.startS + def.checkpointSpacing; s < finishS - def.checkpointSpacing * 0.5; s += def.checkpointSpacing) {
    gates.push(s);
  }
  gates.push(finishS);
  return gates;
}
