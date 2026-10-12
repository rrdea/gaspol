// Crashes and respawns: checks the rider against obstacles (hard hit = crash, soft hit =
// bump), handles crash landings, waits out the tumble, and respawns at the last safe
// point on the trail (checkpoints replace this in M3). Also handles manual respawn (R)
// and falling out of bounds.

import { config } from '../config';
import type { Emitter, GameEvents } from '../core/Events';
import type { Input } from '../core/Input';
import { collideSphere, type SphereObstacle } from '../track/obstacles';
import { onTrail, slopeHeight, trailCenterX } from '../track/terrainShape';
import type { RiderController } from './RiderController';
import { crashRider, type StepEvents } from './riderPhysics';

export class CrashSystem {
  private crashTimer = 0;
  private safeTimer = 0;
  /** Distance down the hill of the last safe point. */
  private safeZ: number = config.rider.startZ;

  constructor(
    private readonly events: Emitter<GameEvents>,
    private readonly obstacles: readonly SphereObstacle[],
    private readonly terrainHeight: (x: number, z: number) => number,
    /** Distance ranges (z) where respawning is not allowed, e.g. ramp run-ups. */
    private readonly noRespawn: readonly { from: number; to: number }[] = [],
  ) {}

  get crashed(): boolean {
    return this.crashTimer > 0;
  }

  fixedUpdate(rider: RiderController, input: Input, ev: StepEvents, dt: number): void {
    const s = rider.state;

    if (input.wasPressed('respawn')) {
      this.respawn(rider, 'manual');
      return;
    }
    // Rider was placed elsewhere mid-crash (e.g. dev tools): forget the old crash.
    if (s.phase !== 'crashed') this.crashTimer = 0;

    if (s.phase === 'crashed') {
      if (this.crashTimer === 0) this.startCrash(ev.landed ? 'landing' : 'obstacle');
      this.crashTimer += dt;
      if (this.crashTimer >= config.crash.respawnDelay) this.respawn(rider, 'crash');
      return;
    }

    const { terrain, crash } = config;
    if (s.pos.y < slopeHeight(s.pos.z, terrain) - crash.killDepth || s.pos.z > terrain.length - crash.endMargin) {
      this.respawn(rider, 'outOfBounds');
      return;
    }

    this.checkObstacles(rider);
    if (rider.state.phase === 'crashed') {
      this.startCrash('obstacle');
      this.crashTimer += dt;
      return;
    }
    this.recordSafePoint(rider, dt);
  }

  private startCrash(cause: GameEvents['crashed']['cause']): void {
    this.crashTimer = Number.EPSILON;
    this.events.emit('crashed', { cause });
  }

  private checkObstacles(rider: RiderController): void {
    const s = rider.state;
    const r = config.crash.riderRadius;
    const hit = collideSphere(s.pos.x, s.pos.y + r, s.pos.z, r, this.obstacles);
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

  private recordSafePoint(rider: RiderController, dt: number): void {
    const s = rider.state;
    const c = config.crash;
    const onGround = s.phase === 'grounded';
    const onBareTerrain = Math.abs(s.pos.y - this.terrainHeight(s.pos.x, s.pos.z)) < c.safeTerrainTolerance;
    const blocked = this.noRespawn.some((r) => s.pos.z >= r.from && s.pos.z <= r.to);
    if (!onGround || !onBareTerrain || blocked || s.speed < c.safeMinSpeed || !onTrail(s.pos.x, s.pos.z, config.terrain)) {
      return;
    }
    this.safeTimer += dt;
    if (this.safeTimer < config.crash.safePointInterval) return;
    this.safeTimer = 0;
    this.safeZ = s.pos.z;
  }

  private respawn(rider: RiderController, reason: GameEvents['respawned']['reason']): void {
    this.crashTimer = 0;
    this.safeTimer = 0;
    // Respawn on the trail centre line, facing down the trail.
    const z = this.safeZ;
    const x = trailCenterX(z, config.terrain);
    rider.placeAt(x, z, trailHeading(z), config.crash.respawnSpeed);
    this.events.emit('respawned', { reason });
  }
}

/** Yaw that points down the trail at distance z. */
function trailHeading(z: number): number {
  const step = 2;
  const dx = trailCenterX(z + step, config.terrain) - trailCenterX(z - step, config.terrain);
  return Math.atan2(dx, step * 2);
}
