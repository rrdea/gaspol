// Pure rider-vs-obstacle overlap tests for rocks (spheres) and trees (vertical
// cylinders, treated as capsules along their axis). The rider is not a Havok body, so
// this keeps the hit test simple, deterministic and unit-testable.

export interface SphereObstacle {
  kind: 'sphere';
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface CylinderObstacle {
  kind: 'cylinder';
  x: number;
  z: number;
  /** Bottom of the axis. */
  y0: number;
  height: number;
  radius: number;
}

export type Obstacle = SphereObstacle | CylinderObstacle;

export interface ObstacleHit {
  obstacle: Obstacle;
  /** Unit vector from the obstacle towards the rider. */
  normal: { x: number; y: number; z: number };
  /** How far the shapes overlap. */
  depth: number;
}

/** Closest point on the obstacle's core (centre point or axis segment) to (x, y, z). */
function corePoint(o: Obstacle, y: number): { x: number; y: number; z: number } {
  if (o.kind === 'sphere') return o;
  return { x: o.x, y: Math.min(Math.max(y, o.y0), o.y0 + o.height), z: o.z };
}

/** Returns the deepest overlap between a sphere at (x, y, z) and the obstacles, or null. */
export function collideRider(
  x: number,
  y: number,
  z: number,
  radius: number,
  obstacles: readonly Obstacle[],
): ObstacleHit | null {
  let best: ObstacleHit | null = null;
  for (const o of obstacles) {
    const c = corePoint(o, y);
    const dx = x - c.x;
    const dy = y - c.y;
    const dz = z - c.z;
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
