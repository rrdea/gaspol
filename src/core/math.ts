// Small angle helpers shared by gameplay code.

/** Wraps an angle to -π..π. */
export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Distance from `a` to the nearest multiple of `step` (signed, -step/2..step/2). */
export function offFromMultiple(a: number, step: number): number {
  return a - Math.round(a / step) * step;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}
