// Pure sphere-vs-obstacle overlap test used for rider collisions with rocks (and,
// later, trees and logs). The rider is not a Havok body, so this keeps the hit test
// simple, deterministic and unit-testable.

export interface SphereObstacle {
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface ObstacleHit {
  obstacle: SphereObstacle;
  /** Unit vector from the obstacle centre towards the rider. */
  normal: { x: number; y: number; z: number };
  /** How far the spheres overlap. */
  depth: number;
}

/** Returns the deepest overlap between a sphere at (x, y, z) and the obstacles, or null. */
export function collideSphere(
  x: number,
  y: number,
  z: number,
  radius: number,
  obstacles: readonly SphereObstacle[],
): ObstacleHit | null {
  let best: ObstacleHit | null = null;
  for (const o of obstacles) {
    const dx = x - o.x;
    const dy = y - o.y;
    const dz = z - o.z;
    const r = radius + o.radius;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r * r) continue;
    const d = Math.sqrt(d2);
    const depth = r - d;
    if (best && depth <= best.depth) continue;
    const n = d > 1e-6 ? { x: dx / d, y: dy / d, z: dz / d } : { x: 0, y: 1, z: 0 };
    best = { obstacle: o, normal: n, depth };
  }
  return best;
}
