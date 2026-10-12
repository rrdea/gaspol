import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { TrackPath } from './TrackPath';
import { TrackTerrain } from './TrackTerrain';

const path = new TrackPath(
  [
    { x: 0, z: 0, grade: 0.2 },
    { x: 0, z: 400, grade: 0.2 },
  ],
  2,
);
const terrain = new TrackTerrain(path, config.track, 0);

describe('TrackTerrain', () => {
  it('rises into banks outside the trail', () => {
    const s = 200;
    const centre = terrain.heightSL(s, 0);
    const edge = config.track.trailHalfWidth + 30;
    expect(terrain.heightSL(s, -edge)).toBeGreaterThan(centre + 10);
    expect(terrain.heightSL(s, edge)).toBeGreaterThan(centre + 10);
  });

  it('matches heightSL through world coordinates', () => {
    expect(terrain.heightAt(5, 200)).toBeCloseTo(terrain.heightSL(200, 5), 5);
  });

  it('is deterministic and smooth at the start', () => {
    expect(terrain.heightSL(123, 4)).toBe(terrain.heightSL(123, 4));
    expect(terrain.heightSL(0, 3)).toBeCloseTo(path.sampleAt(0).y, 5);
  });

  it('knows the trail', () => {
    expect(terrain.onTrail(config.track.trailHalfWidth - 1)).toBe(true);
    expect(terrain.onTrail(-config.track.trailHalfWidth - 1)).toBe(false);
  });
});
