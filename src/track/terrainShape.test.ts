import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { heightAt, slopeHeight, trailCenterX, onTrail } from './terrainShape';

const cfg = config.terrain;

describe('terrain shape', () => {
  it('goes downhill along +Z', () => {
    for (let z = 0; z < cfg.length - 50; z += 50) {
      expect(slopeHeight(z + 50, cfg)).toBeLessThan(slopeHeight(z, cfg));
    }
  });

  it('has banks that rise outside the trail', () => {
    const z = 300;
    const c = trailCenterX(z, cfg);
    const centre = heightAt(c, z, cfg);
    const farLeft = heightAt(c - cfg.trailHalfWidth - 30, z, cfg);
    const farRight = heightAt(c + cfg.trailHalfWidth + 30, z, cfg);
    expect(farLeft).toBeGreaterThan(centre + 10);
    expect(farRight).toBeGreaterThan(centre + 10);
  });

  it('starts with the trail centred', () => {
    expect(trailCenterX(0, cfg)).toBe(0);
    expect(onTrail(0, 0, cfg)).toBe(true);
  });

  it('is deterministic', () => {
    expect(heightAt(12.3, 456.7, cfg)).toBe(heightAt(12.3, 456.7, cfg));
  });
});
