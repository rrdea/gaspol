// Terrain height in track coordinates: the centre-line height plus banks rising outside
// the trail and noise bumps. heightAt(x, z) goes through the path projection. Pure:
// used to build the terrain mesh and for analytic height queries (spawning, camera,
// air assist, tests). Gameplay ground contact still raycasts the built collider.

import { valueNoise2 } from '../core/noise';
import type { TrackConfig } from '../config';
import type { TrackPath } from './TrackPath';

export class TrackTerrain {
  private hint: number | undefined;

  constructor(
    readonly path: TrackPath,
    private readonly cfg: TrackConfig,
    /** Bumps fade in after this distance (the start line). */
    private readonly startS: number,
  ) {}

  /** Bank height for a lateral offset from the centre line. */
  bank(lateral: number): number {
    const outside = Math.max(0, Math.abs(lateral) - this.cfg.trailHalfWidth);
    return outside * outside * this.cfg.bankSteepness;
  }

  heightSL(s: number, lateral: number): number {
    const c = this.cfg;
    const centre = this.path.sampleAt(s).y;
    const bumps =
      valueNoise2(s * c.bumpFreq, lateral * c.bumpFreq, c.seed) * c.bumpAmp +
      valueNoise2(s * c.detailFreq, lateral * c.detailFreq, c.seed + 1) * c.detailAmp;
    const fade = Math.min(Math.max((s - this.startS) / c.bumpFadeIn, 0), 1);
    return centre + this.bank(lateral) + bumps * fade;
  }

  /** Height at a world position (via the nearest point on the centre line). */
  heightAt(x: number, z: number): number {
    const p = this.path.project(x, z, this.hint);
    this.hint = p.index;
    return this.heightSL(p.s, p.lateral);
  }

  onTrail(lateral: number): boolean {
    return Math.abs(lateral) <= this.cfg.trailHalfWidth;
  }
}
