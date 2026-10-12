import { describe, expect, it } from 'vitest';
import { SAVE_KEY, defaultSave, loadSave, recordRun, writeSave } from './Save';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

const throwing = {
  getItem() {
    throw new Error('denied');
  },
  setItem() {
    throw new Error('denied');
  },
} as unknown as Storage;

describe('Save', () => {
  it('returns defaults when empty, missing or corrupt', () => {
    expect(loadSave(new MemoryStorage())).toEqual(defaultSave());
    expect(loadSave(undefined)).toEqual(defaultSave());
    const s = new MemoryStorage();
    s.setItem(SAVE_KEY, '{not json');
    expect(loadSave(s)).toEqual(defaultSave());
    s.setItem(SAVE_KEY, JSON.stringify({ version: 99, coins: 5 }));
    expect(loadSave(s).coins).toBe(0);
  });

  it('survives a storage that throws', () => {
    expect(loadSave(throwing)).toEqual(defaultSave());
    expect(writeSave(throwing, defaultSave())).toBe(false);
  });

  it('round-trips and ignores bad fields', () => {
    const s = new MemoryStorage();
    const data = { ...defaultSave(), coins: 42, bestTimes: { a: 61000 } };
    expect(writeSave(s, data)).toBe(true);
    expect(loadSave(s)).toEqual(data);
    s.setItem(SAVE_KEY, JSON.stringify({ ...data, bestTimes: { a: 'fast' } }));
    expect(loadSave(s).bestTimes).toEqual({});
  });

  it('keeps the best time and trick score', () => {
    let r = recordRun(defaultSave(), 't', 80000, 500);
    expect(r.newBestTime).toBe(true);
    expect(r.newBestTricks).toBe(true);
    r = recordRun(r.save, 't', 90000, 900);
    expect(r.newBestTime).toBe(false);
    expect(r.newBestTricks).toBe(true);
    expect(r.save.bestTimes.t).toBe(80000);
    expect(r.save.bestTrickScores.t).toBe(900);
    r = recordRun(r.save, 't', 70000, 0);
    expect(r.newBestTime).toBe(true);
    expect(r.save.bestTimes.t).toBe(70000);
  });
});
