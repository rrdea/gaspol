import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { classifyLanding, landingError, riderUp } from './landing';

const DEG = Math.PI / 180;
const up = { x: 0, y: 1, z: 0 };
const classify = (pitchDeg: number, yawDeg = 0) =>
  classifyLanding(landingError(0, pitchDeg * DEG, yawDeg * DEG, up), config.landing);

describe('landing', () => {
  it('riderUp tilts backwards with positive pitch', () => {
    const u = riderUp(0, 90 * DEG);
    expect(u.z).toBeCloseTo(-1);
    expect(u.y).toBeCloseTo(0);
  });

  it('classifies tilt', () => {
    expect(classify(0)).toBe('clean');
    expect(classify(360)).toBe('clean');
    expect(classify(-10)).toBe('clean');
    expect(classify(40)).toBe('sloppy');
    expect(classify(90)).toBe('crash');
    expect(classify(180)).toBe('crash');
  });

  it('classifies spin, with 180s landing clean (auto-revert)', () => {
    expect(classify(0, 170)).toBe('clean');
    expect(classify(0, 360)).toBe('clean');
    expect(classify(0, 45)).toBe('sloppy');
    expect(classify(0, 90)).toBe('crash');
  });

  it('landing on a slope matches the slope pitch', () => {
    const slope = 20 * DEG;
    const normal = { x: 0, y: Math.cos(slope), z: Math.sin(slope) }; // downhill along +Z
    expect(landingError(0, -slope, 0, normal)).toBeCloseTo(0);
  });
});
