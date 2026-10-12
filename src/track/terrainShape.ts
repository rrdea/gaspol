// Pure height function for the M1 test hill: a long downhill slope (along +Z) with
// a wandering trail, banks on both sides and noise bumps. Replaced by the spline
// TrackBuilder in M3; kept free of Babylon so it can be unit tested.

import { valueNoise2 } from '../core/noise';
import type { TerrainConfig } from '../config';

/** X position of the trail centre at a given distance down the hill. */
export function trailCenterX(z: number, cfg: TerrainConfig): number {
  // Fade the wander in after the start so the rider starts pointing straight down.
  const fadeIn = Math.min(Math.max(z / 80, 0), 1);
  return Math.sin((z / cfg.wanderPeriod) * Math.PI * 2) * cfg.wanderAmp * fadeIn;
}

/** Height of the slope profile (no banks or bumps). Negative z is a gentler start pad. */
export function slopeHeight(z: number, cfg: TerrainConfig): number {
  if (z < 0) return -z * cfg.baseSlope * 0.3;
  const p = cfg.slopeVariationPeriod;
  // Integral of slope(z) = baseSlope + slopeVariation * sin(z / p)  (sections get steeper and flatter).
  return -(z * cfg.baseSlope + cfg.slopeVariation * p * (1 - Math.cos(z / p)));
}

/** Full terrain height at world (x, z). */
export function heightAt(x: number, z: number, cfg: TerrainConfig): number {
  const dx = Math.abs(x - trailCenterX(z, cfg));
  const outside = Math.max(0, dx - cfg.trailHalfWidth);
  const bank = outside * outside * cfg.bankSteepness;
  const bumps =
    valueNoise2(x * cfg.bumpFreq, z * cfg.bumpFreq, cfg.seed) * cfg.bumpAmp +
    valueNoise2(x * cfg.detailFreq, z * cfg.detailFreq, cfg.seed + 1) * cfg.detailAmp;
  // Keep the start area smooth.
  const bumpFade = Math.min(Math.max((z - 10) / 40, 0), 1);
  return slopeHeight(z, cfg) + bank + bumps * bumpFade;
}

/** True when (x, z) is on the rideable trail (used for colouring). */
export function onTrail(x: number, z: number, cfg: TerrainConfig): boolean {
  return Math.abs(x - trailCenterX(z, cfg)) <= cfg.trailHalfWidth;
}
