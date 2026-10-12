// Turns landings into tricks and points: records grabs while airborne, detects flips,
// spins and grabs on landing, applies the combo multiplier, gives a speed boost for
// clean tricks, and emits events for the HUD (and later audio/FX).

import { config } from '../config';
import type { Emitter, GameEvents } from '../core/Events';
import type { RiderController } from './RiderController';
import type { StepEvents } from './riderPhysics';
import { ComboTracker, detectTricks, scoreTricks, type GrabName, type GrabRecord } from './tricks';

export class TrickSystem {
  /** Total trick points this run. */
  score = 0;
  private readonly combo = new ComboTracker(config.tricks);
  private readonly grabs = new Map<GrabName, number>();

  constructor(private readonly events: Emitter<GameEvents>) {}

  get multiplier(): number {
    return this.combo.multiplier;
  }

  fixedUpdate(rider: RiderController, ev: StepEvents, dt: number): void {
    const s = rider.state;
    if (ev.tookOff) this.grabs.clear();
    if (s.phase === 'airborne' && rider.grab) {
      this.grabs.set(rider.grab, (this.grabs.get(rider.grab) ?? 0) + dt);
    }

    if (ev.landed) {
      const land = ev.landed;
      this.events.emit('landed', { quality: land.quality, airTime: land.airTime });
      if (land.quality === 'crash') {
        this.combo.end();
      } else {
        const grabs: GrabRecord[] = [...this.grabs].map(([name, time]) => ({ name, time }));
        const tricks = detectTricks({ pitch: land.pitch, yaw: land.yaw, airTime: land.airTime, grabs }, config.tricks);
        const base = scoreTricks(tricks, land.airTime, 1, config.tricks);
        const result = this.combo.land(land.quality, base);
        if (tricks.length > 0) {
          this.score += result.points;
          this.events.emit('trickLanded', {
            names: tricks.map((t) => t.name),
            points: result.points,
            multiplier: result.multiplier,
            comboTotal: result.comboTotal,
            quality: land.quality,
          });
          if (land.quality === 'clean') {
            const boost = Math.min(config.tricks.boostPerTrick * tricks.length, config.tricks.maxBoost);
            s.speed = Math.min(s.speed + boost, config.rider.topSpeed);
          }
        }
      }
      this.grabs.clear();
    }

    const ended = this.combo.update(dt, s.phase === 'grounded');
    if (ended !== null && ended > 0) this.events.emit('comboEnded', { total: ended });
  }

  /** Crashing loses the current combo. */
  onCrash(): void {
    this.combo.end();
    this.grabs.clear();
  }
}
