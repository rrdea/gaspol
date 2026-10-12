import { describe, expect, it } from 'vitest';
import { TrackPath, type ControlPoint } from './TrackPath';
import { bukitHijau } from './TrackData';
import { config } from '../config';

const pts: ControlPoint[] = [
  { x: 0, z: 0, grade: 0.1 },
  { x: 0, z: 100, grade: 0.2 },
  { x: 50, z: 200, grade: 0.2 },
  { x: 50, z: 300, grade: 0.1 },
];
const path = new TrackPath(pts, 2);

describe('TrackPath', () => {
  it('has a length close to the control polyline', () => {
    const poly = 100 + Math.hypot(50, 100) + 100;
    expect(path.length).toBeGreaterThan(poly);
    expect(path.length).toBeLessThan(poly * 1.1);
  });

  it('starts and ends at the control points', () => {
    const a = path.sampleAt(0);
    const b = path.sampleAt(path.length);
    expect(a.x).toBeCloseTo(0);
    expect(a.z).toBeCloseTo(0);
    // Ends within one sample step of the last control point.
    expect(Math.hypot(b.x - 50, b.z - 300)).toBeLessThan(2);
  });

  it('runs downhill everywhere', () => {
    for (let s = 2; s < path.length; s += 2) {
      expect(path.sampleAt(s).y).toBeLessThan(path.sampleAt(s - 2).y);
    }
  });

  it('heads along +Z at the start', () => {
    expect(path.sampleAt(0).heading).toBeCloseTo(0, 1);
  });

  it('projects a centre-line point back to its s', () => {
    for (const s of [10, 150, 260]) {
      const p = path.sampleAt(s);
      const proj = path.project(p.x, p.z);
      expect(proj.s).toBeCloseTo(s, 0);
      expect(Math.abs(proj.lateral)).toBeLessThan(0.05);
    }
  });

  it('gives positive lateral to the right of travel', () => {
    const s = 50;
    const p = path.sampleAt(s);
    const r = path.rightAt(s);
    const proj = path.project(p.x + r.x * 5, p.z + r.z * 5);
    expect(proj.lateral).toBeCloseTo(5, 1);
    expect(proj.s).toBeCloseTo(s, 0);
  });

  it('works with a hint, including after moving past the window', () => {
    const p = path.sampleAt(280);
    expect(path.project(p.x, p.z, 0).s).toBeCloseTo(280, 0);
  });
});

describe('Bukit Hijau path', () => {
  const bh = new TrackPath(bukitHijau.points, config.track.sampleStep);

  it('curves gently enough for the terrain ribbon not to fold', () => {
    // Minimum turning radius must exceed the terrain half width.
    const ds = 10;
    for (let s = ds; s < bh.length - ds; s += ds) {
      const turn = Math.abs(bh.sampleAt(s + ds).heading - bh.sampleAt(s - ds).heading);
      const radius = (2 * ds) / Math.max(turn, 1e-6);
      expect(radius).toBeGreaterThan(config.track.halfWidth * 1.2);
    }
  });
});
