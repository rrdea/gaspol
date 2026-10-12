// Save data in localStorage (key gaspol_save_v1). Every storage access is wrapped in
// try/catch: if storage is unavailable or corrupt, the game still works, just without
// saving. Pure apart from the injected Storage.

export const SAVE_KEY = 'gaspol_save_v1';

export interface SaveData {
  version: 1;
  /** Best race time per track id, in ms. */
  bestTimes: Record<string, number>;
  /** Best trick score per track id. */
  bestTrickScores: Record<string, number>;
  coins: number;
  upgrades: Record<string, number>;
  unlocked: string[];
  settings: { musicVolume: number; sfxVolume: number; quality: 'low' | 'high' };
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    bestTimes: {},
    bestTrickScores: {},
    coins: 0,
    upgrades: {},
    unlocked: ['bukit-hijau'],
    settings: { musicVolume: 0.7, sfxVolume: 0.8, quality: 'high' },
  };
}

function isRecordOfNumbers(v: unknown): v is Record<string, number> {
  return typeof v === 'object' && v !== null && Object.values(v).every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** Loads the save, falling back to defaults for anything missing or invalid. */
export function loadSave(storage: Storage | undefined): SaveData {
  const save = defaultSave();
  let raw: string | null = null;
  try {
    raw = storage?.getItem(SAVE_KEY) ?? null;
  } catch {
    return save;
  }
  if (!raw) return save;
  try {
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data.version !== 1) return save;
    if (isRecordOfNumbers(data.bestTimes)) save.bestTimes = data.bestTimes;
    if (isRecordOfNumbers(data.bestTrickScores)) save.bestTrickScores = data.bestTrickScores;
    if (typeof data.coins === 'number' && Number.isFinite(data.coins)) save.coins = data.coins;
    if (isRecordOfNumbers(data.upgrades)) save.upgrades = data.upgrades;
    if (Array.isArray(data.unlocked)) save.unlocked = data.unlocked.filter((s) => typeof s === 'string');
    if (data.settings && typeof data.settings === 'object') save.settings = { ...save.settings, ...data.settings };
  } catch {
    // Corrupt JSON: start fresh.
  }
  return save;
}

/** Writes the save. Returns false if storage is unavailable. */
export function writeSave(storage: Storage | undefined, save: SaveData): boolean {
  try {
    if (!storage) return false;
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export interface RunResult {
  save: SaveData;
  newBestTime: boolean;
  newBestTricks: boolean;
}

/** Records a finished run, keeping the best time and best trick score. */
export function recordRun(save: SaveData, trackId: string, timeMs: number, trickScore: number): RunResult {
  const prevTime = save.bestTimes[trackId];
  const prevTricks = save.bestTrickScores[trackId] ?? 0;
  const newBestTime = prevTime === undefined || timeMs < prevTime;
  const newBestTricks = trickScore > prevTricks;
  return {
    save: {
      ...save,
      bestTimes: { ...save.bestTimes, [trackId]: newBestTime ? timeMs : prevTime },
      bestTrickScores: { ...save.bestTrickScores, [trackId]: Math.max(prevTricks, trickScore) },
    },
    newBestTime,
    newBestTricks,
  };
}

/** The browser's localStorage, or undefined if even accessing it throws. */
export function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
