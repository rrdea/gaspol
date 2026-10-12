import { describe, expect, it } from 'vitest';
import { config } from '../config';
import { ComboTracker, detectTricks, scoreTricks, type AirStats } from './tricks';

const cfg = config.tricks;
const TAU = Math.PI * 2;
const air = (a: Partial<AirStats>): AirStats => ({ pitch: 0, yaw: 0, airTime: 1, grabs: [], ...a });
const names = (a: Partial<AirStats>) => detectTricks(air(a), cfg).map((t) => t.name);

describe('detectTricks', () => {
  it('finds flips by direction and count', () => {
    expect(names({ pitch: TAU })).toEqual(['Backflip']);
    expect(names({ pitch: -TAU })).toEqual(['Frontflip']);
    expect(names({ pitch: 2 * TAU - 0.3 })).toEqual(['Double Backflip']);
    expect(names({ pitch: Math.PI })).toEqual([]);
  });

  it('finds spins in 180s', () => {
    expect(names({ yaw: Math.PI })).toEqual(['180']);
    expect(names({ yaw: -TAU })).toEqual(['360']);
    expect(names({ yaw: 3 * Math.PI - 0.2 })).toEqual(['540']);
    expect(names({ yaw: 0.5 })).toEqual([]);
  });

  it('counts grabs held long enough', () => {
    expect(names({ grabs: [{ name: 'Superman', time: cfg.minGrabTime + 0.1 }] })).toEqual(['Superman']);
    expect(names({ grabs: [{ name: 'Superman', time: cfg.minGrabTime - 0.1 }] })).toEqual([]);
  });

  it('combines tricks in one jump', () => {
    expect(names({ pitch: TAU, yaw: TAU, grabs: [{ name: 'Can-Can', time: 1 }] })).toEqual([
      'Backflip',
      '360',
      'Can-Can',
    ]);
  });
});

describe('scoreTricks', () => {
  const tricks = [{ name: 'Backflip', points: 1000 }];
  it('scales with airtime and multiplier', () => {
    expect(scoreTricks(tricks, 0, 1, cfg)).toBe(1000);
    expect(scoreTricks(tricks, 2, 1, cfg)).toBe(Math.round(1000 * (1 + 2 * cfg.airtimeBonus)));
    expect(scoreTricks(tricks, 0, 3, cfg)).toBe(3000);
    expect(scoreTricks([], 2, 3, cfg)).toBe(0);
  });
});

describe('ComboTracker', () => {
  it('grows the multiplier for tricks chained within the window', () => {
    const c = new ComboTracker(cfg);
    expect(c.land('clean', 100).multiplier).toBe(1);
    c.update(cfg.comboWindow / 2, true);
    const r = c.land('clean', 100);
    expect(r.multiplier).toBe(2);
    expect(r.points).toBe(200);
    expect(r.comboTotal).toBe(300);
  });

  it('ends the combo after too long on the ground', () => {
    const c = new ComboTracker(cfg);
    c.land('clean', 100);
    expect(c.update(cfg.comboWindow + 0.1, true)).toBe(100);
    expect(c.land('clean', 100).multiplier).toBe(1);
  });

  it('does not count ground time while airborne', () => {
    const c = new ComboTracker(cfg);
    c.land('clean', 100);
    expect(c.update(cfg.comboWindow * 3, false)).toBeNull();
    expect(c.land('clean', 100).multiplier).toBe(2);
  });

  it('caps the multiplier', () => {
    const c = new ComboTracker(cfg);
    for (let i = 0; i < 20; i++) c.land('clean', 10);
    expect(c.multiplier).toBe(cfg.maxMultiplier);
  });

  it('resets on sloppy landings and crashes', () => {
    const c = new ComboTracker(cfg);
    c.land('clean', 100);
    c.land('clean', 100);
    const sloppy = c.land('sloppy', 100);
    expect(sloppy.multiplier).toBe(1);
    expect(sloppy.points).toBe(100);
    c.land('clean', 100);
    c.land('clean', 100);
    expect(c.land('crash', 100).points).toBe(0);
    expect(c.multiplier).toBe(1);
  });
});
