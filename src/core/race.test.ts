import { describe, expect, it } from 'vitest';
import { RaceClock, formatTime } from './race';

describe('RaceClock', () => {
  it('ticks 2, 1 then go after a 3 s countdown', () => {
    const c = new RaceClock(3);
    expect(c.firstTick).toBe(3);
    const events: string[] = [];
    for (let i = 0; i < 40; i++) {
      const e = c.step(0.1);
      if (e) events.push(e.kind === 'tick' ? String(e.n) : 'go');
    }
    expect(events).toEqual(['2', '1', 'go']);
    expect(c.phase).toBe('racing');
  });

  it('only counts time while racing', () => {
    const c = new RaceClock(1);
    c.step(0.5);
    expect(c.elapsed).toBe(0);
    c.step(0.75); // 0.25 into the race
    expect(c.elapsed).toBeCloseTo(0.25);
    c.step(1);
    expect(c.elapsed).toBeCloseTo(1.25);
    c.finish();
    c.step(1);
    expect(c.elapsed).toBeCloseTo(1.25);
  });

  it('resets', () => {
    const c = new RaceClock(1);
    c.step(2);
    c.reset();
    expect(c.phase).toBe('countdown');
    expect(c.elapsed).toBe(0);
  });
});

describe('formatTime', () => {
  it('formats m:ss.cc', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(61234)).toBe('1:01.23');
    expect(formatTime(9999)).toBe('0:10.00');
    expect(formatTime(125005)).toBe('2:05.01');
  });
});
