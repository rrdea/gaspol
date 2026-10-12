// The track's centre line: a centripetal Catmull-Rom spline through control points,
// resampled at even spacing. Height comes from integrating each point's downhill grade
// over distance, so tracks always run downhill. Used for terrain, props, checkpoints,
// respawn, out-of-bounds, the autopilot and (M5) AI riders. Pure: no Babylon.

import { wrapAngle } from '../core/math';

export interface ControlPoint {
  x: number;
  z: number;
  /** Downhill grade (drop per metre) at this point. */
  grade: number;
}

export interface PathSample {
  x: number;
  y: number;
  z: number;
  /** Yaw of the track direction (0 = +Z, positive towards +X), same convention as the rider. */
  heading: number;
  grade: number;
}

export interface Projection {
  /** Distance along the track (clamped to 0..length). */
  s: number;
  /** Signed distance from the centre line; positive = right of the travel direction. */
  lateral: number;
  /** Index of the nearest sample (use as the hint for the next query). */
  index: number;
}

/** Dense points per spline segment before resampling. */
const SUBDIVISIONS = 64;
/** Samples searched either side of a hint. */
const HINT_WINDOW = 40;

export class TrackPath {
  readonly length: number;
  readonly step: number;
  private readonly xs: Float64Array;
  private readonly ys: Float64Array;
  private readonly zs: Float64Array;
  private readonly headings: Float64Array;
  private readonly grades: Float64Array;

  constructor(points: readonly ControlPoint[], step: number, startY = 0) {
    if (points.length < 2) throw new Error('TrackPath needs at least 2 control points');
    this.step = step;

    // 1. Dense polyline along the spline, carrying an interpolated grade.
    const dense: { x: number; z: number; grade: number }[] = [];
    const ext = [extrapolate(points[1], points[0]), ...points, extrapolate(points[points.length - 2], points[points.length - 1])];
    for (let i = 1; i < ext.length - 2; i++) {
      for (let k = 0; k < SUBDIVISIONS; k++) {
        const t = k / SUBDIVISIONS;
        const p = centripetal(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], t);
        dense.push({ ...p, grade: ext[i].grade + (ext[i + 1].grade - ext[i].grade) * t });
      }
    }
    const last = points[points.length - 1];
    dense.push({ x: last.x, z: last.z, grade: last.grade });

    // 2. Cumulative distance along the dense polyline.
    const cum = new Float64Array(dense.length);
    for (let i = 1; i < dense.length; i++) {
      cum[i] = cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z);
    }
    // 3. Resample at even spacing and integrate height. The track ends at the last whole
    // step, at most one step short of the final control point.
    const n = Math.floor(cum[cum.length - 1] / step) + 1;
    this.length = (n - 1) * step;
    this.xs = new Float64Array(n);
    this.ys = new Float64Array(n);
    this.zs = new Float64Array(n);
    this.headings = new Float64Array(n);
    this.grades = new Float64Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const s = i * step;
      while (j < dense.length - 2 && cum[j + 1] < s) j++;
      const seg = cum[j + 1] - cum[j] || 1;
      const t = Math.min(Math.max((s - cum[j]) / seg, 0), 1);
      const a = dense[j];
      const b = dense[j + 1];
      this.xs[i] = a.x + (b.x - a.x) * t;
      this.zs[i] = a.z + (b.z - a.z) * t;
      this.grades[i] = a.grade + (b.grade - a.grade) * t;
      this.ys[i] = i === 0 ? startY : this.ys[i - 1] - ((this.grades[i - 1] + this.grades[i]) / 2) * step;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(i - 1, 0);
      const b = Math.min(i + 1, n - 1);
      this.headings[i] = Math.atan2(this.xs[b] - this.xs[a], this.zs[b] - this.zs[a]);
    }
  }

  get sampleCount(): number {
    return this.xs.length;
  }

  /** Interpolated centre-line sample at distance s (clamped to the track). */
  sampleAt(s: number): PathSample {
    const n = this.xs.length;
    const f = Math.min(Math.max(s / this.step, 0), n - 1);
    const i = Math.min(Math.floor(f), n - 2);
    const t = f - i;
    const lerp = (arr: Float64Array) => arr[i] + (arr[i + 1] - arr[i]) * t;
    const h0 = this.headings[i];
    return {
      x: lerp(this.xs),
      y: lerp(this.ys),
      z: lerp(this.zs),
      heading: h0 + wrapAngle(this.headings[i + 1] - h0) * t,
      grade: lerp(this.grades),
    };
  }

  /** Unit vector to the right of the travel direction at s. */
  rightAt(s: number): { x: number; z: number } {
    const h = this.sampleAt(s).heading;
    return { x: Math.cos(h), z: -Math.sin(h) };
  }

  /** Nearest point on the centre line to (x, z). Pass the previous `index` as a hint for speed. */
  project(x: number, z: number, hint?: number): Projection {
    const n = this.xs.length;
    let lo = 0;
    let hi = n - 1;
    if (hint !== undefined) {
      lo = Math.max(0, hint - HINT_WINDOW);
      hi = Math.min(n - 1, hint + HINT_WINDOW);
    }
    let best = lo;
    let bestD = Infinity;
    for (let i = lo; i <= hi; i++) {
      const dx = x - this.xs[i];
      const dz = z - this.zs[i];
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    // A hint at the window edge may mean we have moved further: fall back to a full search.
    if (hint !== undefined && (best === lo || best === hi) && best !== 0 && best !== n - 1) {
      return this.project(x, z);
    }

    // Refine on the neighbouring segments.
    let s = best * this.step;
    let lateral = this.lateralAt(best, x, z);
    for (const a of [best - 1, best]) {
      if (a < 0 || a + 1 >= n) continue;
      const sx = this.xs[a + 1] - this.xs[a];
      const sz = this.zs[a + 1] - this.zs[a];
      const len2 = sx * sx + sz * sz || 1;
      const t = ((x - this.xs[a]) * sx + (z - this.zs[a]) * sz) / len2;
      if (t < 0 || t > 1) continue;
      const px = this.xs[a] + sx * t;
      const pz = this.zs[a] + sz * t;
      const d = (x - px) ** 2 + (z - pz) ** 2;
      if (d <= bestD + 1e-9) {
        bestD = d;
        s = (a + t) * this.step;
        const len = Math.sqrt(len2);
        // Right of the segment direction: (dz, -dx) / len.
        lateral = ((x - px) * sz - (z - pz) * sx) / len;
      }
    }
    return { s, lateral, index: best };
  }

  private lateralAt(i: number, x: number, z: number): number {
    const h = this.headings[i];
    return (x - this.xs[i]) * Math.cos(h) - (z - this.zs[i]) * Math.sin(h);
  }
}

function extrapolate(from: ControlPoint, to: ControlPoint): ControlPoint {
  return { x: 2 * to.x - from.x, z: 2 * to.z - from.z, grade: to.grade };
}

/** Centripetal Catmull-Rom (Barry–Goldman) between p1 and p2. */
function centripetal(
  p0: ControlPoint,
  p1: ControlPoint,
  p2: ControlPoint,
  p3: ControlPoint,
  t: number,
): { x: number; z: number } {
  const knot = (a: ControlPoint, b: ControlPoint) => Math.max(Math.sqrt(Math.hypot(b.x - a.x, b.z - a.z)), 1e-4);
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const mix = (a: { x: number; z: number }, b: { x: number; z: number }, ta: number, tb: number) => {
    const wa = (tb - u) / (tb - ta);
    const wb = (u - ta) / (tb - ta);
    return { x: a.x * wa + b.x * wb, z: a.z * wa + b.z * wb };
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}
