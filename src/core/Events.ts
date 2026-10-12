// Tiny typed event emitter. Systems (HUD, audio, FX) listen to game events instead of
// being called directly.

type Handler<T> = (payload: T) => void;

export class Emitter<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of set) (h as Handler<Events[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}

import type { LandingQuality } from '../rider/landing';

/** Events raised during a race. Grows with later milestones. */
export interface GameEvents {
  jumped: Record<string, never>;
  tookOff: Record<string, never>;
  landed: { quality: LandingQuality; airTime: number };
  trickLanded: { names: string[]; points: number; multiplier: number; comboTotal: number; quality: LandingQuality };
  comboEnded: { total: number };
  crashed: { cause: 'landing' | 'obstacle' };
  respawned: { reason: 'manual' | 'outOfBounds' | 'crash' };
}
