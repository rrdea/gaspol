import { describe, expect, it } from 'vitest';
import { CheckpointTracker } from './checkpointTracker';

const make = () => new CheckpointTracker([100, 200, 300], 10, 0);

describe('CheckpointTracker', () => {
  it('passes gates in order and reports the finish', () => {
    const c = make();
    expect(c.update(90, 101, 0)).toBe('checkpoint');
    expect(c.lastPassedS).toBe(100);
    expect(c.update(199, 201, 5)).toBe('checkpoint');
    expect(c.update(299, 300, -5)).toBe('finish');
    expect(c.finished).toBe(true);
    expect(c.update(300, 310, 0)).toBeNull();
  });

  it('does not count a gate passed outside its width', () => {
    const c = make();
    expect(c.update(90, 110, 15)).toBeNull();
    expect(c.passed).toBe(0);
  });

  it('does not count skipping ahead to a later gate', () => {
    const c = make();
    c.update(90, 110, 15); // missed gate 1
    expect(c.update(190, 210, 0)).toBeNull();
    expect(c.passed).toBe(0);
    expect(c.lastPassedS).toBe(0);
  });

  it('does not count crossing backwards', () => {
    const c = make();
    expect(c.update(110, 90, 0)).toBeNull();
  });

  it('resets', () => {
    const c = make();
    c.update(90, 110, 0);
    c.reset();
    expect(c.passed).toBe(0);
  });
});
