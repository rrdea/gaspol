// Crashes and respawns: checks the rider against obstacles (hard hit = crash, soft hit =
// bump), handles crash landings, waits out the tumble, and respawns at the last
// checkpoint facing down the track. Also handles manual respawn (R) and going out of
// bounds (too far from the track centre line, or falling off the world).

import { config } from '../config';
import type { Emitter, GameEvents } from '../core/Events';
import type { Input } from '../core/Input';
import { collideRider, type Obstacle } from '../track/obstacles';
import type { Projection, TrackPath } from '../track/TrackPath';
import type { RiderController } from './RiderController';
import { crashRider, type StepEvents } from './riderPhysics';

export class CrashSystem {
  private crashTimer = 0;

  constructor(
    private readonly events: Emitter<GameEvents>,
    private readonly obstacles: readonly Obstacle[],
    private readonly path: TrackPath,
    /** Where to respawn: distance along the track of the last checkpoint. */
    private readonly respawnS: () => number,
  ) {}

  get crashed(): boolean {
    return this.crashTimer > 0;
  }

  /** `proj` is the rider's current projection onto the track. */
  fixedUpdate(rider: RiderController, input: Input, ev: StepEvents, proj: Projection, dt: number): void {
    const s = rider.state;

    if (input.wasPressed('respawn') && rider.mode === 'player') {
      this.respawn(rider, 'manual');
      return;
    }
    // Rider was placed elsewhere mid-crash (retry, dev tools): forget the old crash.
    if (s.phase !== 'crashed') this.crashTimer = 0;

    if (s.phase === 'crashed') {
      if (this.crashTimer === 0) this.startCrash(ev.landed ? 'landing' : 'obstacle');
      this.crashTimer += dt;
      if (this.crashTimer >= config.crash.respawnDelay) this.respawn(rider, 'crash');
      return;
    }

    const centreY = this.path.sampleAt(proj.s).y;
    const outOfBounds = Math.abs(proj.lateral) > config.track.oobLateral || s.pos.y < centreY - config.crash.killDepth;
    if (outOfBounds) {
      this.respawn(rider, 'outOfBounds');
      return;
    }

    this.checkObstacles(rider);
    if (rider.state.phase === 'crashed') {
      this.startCrash('obstacle');
      this.crashTimer += dt;
    }
  }

  /** Puts the rider at the last checkpoint, facing down the track. */
  respawn(rider: RiderController, reason: GameEvents['respawned']['reason']): void {
    this.crashTimer = 0;
    const c = this.path.sampleAt(this.respawnS());
    rider.placeAt(c.x, c.z, c.heading, config.crash.respawnSpeed);
    this.events.emit('respawned', { reason });
  }

  private startCrash(cause: GameEvents['crashed']['cause']): void {
    this.crashTimer = Number.EPSILON;
    this.events.emit('crashed', { cause });
  }

  private checkObstacles(rider: RiderController): void {
    const s = rider.state;
    const r = config.crash.riderRadius;
    const hit = collideRider(s.pos.x, s.pos.y + r, s.pos.z, r, this.obstacles);
    if (!hit) return;
    const n = hit.normal;
    const impact = -(s.vel.x * n.x + s.vel.y * n.y + s.vel.z * n.z);
    if (impact > config.crash.crashImpactSpeed) {
      crashRider(s);
      return;
    }
    // Soft bump: push out sideways and lose most of the speed.
    const h = Math.hypot(n.x, n.z) || 1;
    s.pos.x += (n.x / h) * hit.depth;
    s.pos.z += (n.z / h) * hit.depth;
    if (impact > 0) {
      const keep = config.crash.bumpSpeedKeep;
      s.speed *= keep;
      s.vel.x *= keep;
      s.vel.y *= keep;
      s.vel.z *= keep;
    }
  }
}
