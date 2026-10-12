import { describe, expect, it } from 'vitest';
import { collideRider, type CylinderObstacle, type SphereObstacle } from './obstacles';

const rock: SphereObstacle = { kind: 'sphere', x: 0, y: 0, z: 10, radius: 1 };
const tree: CylinderObstacle = { kind: 'cylinder', x: 5, z: 0, y0: 0, height: 6, radius: 0.5 };

describe('collideRider', () => {
  it('reports no hit when apart', () => {
    expect(collideRider(0, 0, 0, 0.5, [rock, tree])).toBeNull();
  });

  it('reports normal and depth on a rock', () => {
    const hit = collideRider(0, 0, 8.7, 0.5, [rock]);
    expect(hit!.normal.z).toBeCloseTo(-1);
    expect(hit!.depth).toBeCloseTo(0.2);
  });

  it('hits a tree trunk side-on with a horizontal normal', () => {
    const hit = collideRider(4.2, 3, 0, 0.5, [tree]);
    expect(hit).not.toBeNull();
    expect(hit!.normal.x).toBeCloseTo(-1);
    expect(hit!.normal.y).toBeCloseTo(0);
    expect(hit!.depth).toBeCloseTo(0.2);
  });

  it('misses a tree when far above it', () => {
    expect(collideRider(5, 8, 0, 0.5, [tree])).toBeNull();
  });

  it('picks the deepest of several overlaps', () => {
    const other: SphereObstacle = { kind: 'sphere', x: 0, y: 0, z: 7, radius: 1 };
    const hit = collideRider(0, 0, 8.6, 1, [rock, other]); // overlaps both, rock more
    expect(hit!.obstacle).toBe(rock);
  });
});
