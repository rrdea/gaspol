import { describe, expect, it } from 'vitest';
import { collideSphere } from './obstacles';

const rock = { x: 0, y: 0, z: 10, radius: 1 };

describe('collideSphere', () => {
  it('reports no hit when apart', () => {
    expect(collideSphere(0, 0, 0, 0.5, [rock])).toBeNull();
  });

  it('reports normal and depth on overlap', () => {
    const hit = collideSphere(0, 0, 8.7, 0.5, [rock]);
    expect(hit).not.toBeNull();
    expect(hit!.normal.z).toBeCloseTo(-1);
    expect(hit!.depth).toBeCloseTo(0.2);
  });

  it('picks the deepest of several overlaps', () => {
    const other = { x: 0, y: 0, z: 7, radius: 1 };
    const hit = collideSphere(0, 0, 8.6, 1, [rock, other]); // overlaps both, rock more
    expect(hit!.obstacle).toBe(rock);
  });
});
