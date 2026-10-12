import { describe, expect, it } from 'vitest';
import { Emitter } from './Events';

interface TestEvents {
  ping: { n: number };
}

describe('Emitter', () => {
  it('delivers payloads and unsubscribes', () => {
    const e = new Emitter<TestEvents>();
    const got: number[] = [];
    const off = e.on('ping', (p) => got.push(p.n));
    e.emit('ping', { n: 1 });
    off();
    e.emit('ping', { n: 2 });
    expect(got).toEqual([1]);
  });
});
