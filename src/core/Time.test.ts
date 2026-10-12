import { describe, expect, it } from 'vitest';
import { FixedStep } from './Time';

describe('FixedStep', () => {
  it('runs one step per 1/60 s frame', () => {
    const t = new FixedStep(1 / 60, 0.25);
    expect(t.advance(1 / 60)).toBe(1);
  });

  it('carries leftover time into the next frame', () => {
    const t = new FixedStep(0.25, 1);
    expect(t.advance(0.375)).toBe(1);
    expect(t.alpha).toBeCloseTo(0.5);
    expect(t.advance(0.125)).toBe(1);
    expect(t.alpha).toBeCloseTo(0);
  });

  it('runs two steps at 30 fps', () => {
    const t = new FixedStep(1 / 60, 0.25);
    expect(t.advance(1 / 30)).toBe(2);
  });

  it('clamps very long frames', () => {
    const t = new FixedStep(0.01, 0.1);
    expect(t.advance(5)).toBe(10);
  });

  it('ignores negative frame time', () => {
    const t = new FixedStep(0.01, 0.1);
    expect(t.advance(-1)).toBe(0);
  });
});
