// Arcade rider controller. Casts two rays (front and rear wheel) down onto the Havok
// colliders to find ground height and normal, then advances the pure riderPhysics step.
// Keeps the previous step's state so the visual can interpolate between fixed steps.

import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult';
import type { PhysicsEngine } from '@babylonjs/core/Physics/v2/physicsEngine';
import type { Scene } from '@babylonjs/core/scene';
import { config } from '../config';
import type { Input } from '../core/Input';
import type { Emitter, GameEvents } from '../core/Events';
import {
  createRiderState,
  stepRider,
  type GroundSample,
  type RiderInput,
  type RiderState,
  type Vec3,
} from './riderPhysics';

export class RiderController {
  state: RiderState;
  /** Snapshot of position/heading from the previous fixed step, for render interpolation. */
  readonly prevPos: Vec3 = { x: 0, y: 0, z: 0 };
  prevHeading = 0;

  private readonly physics: PhysicsEngine;
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly hit = new PhysicsRaycastResult();
  private readonly input: RiderInput = { steer: 0, pedal: false, brake: false };

  constructor(
    scene: Scene,
    private readonly spawnHeight: (x: number, z: number) => number,
    private readonly killHeight: (z: number) => number,
    private readonly events: Emitter<GameEvents>,
  ) {
    const engine = scene.getPhysicsEngine();
    if (!engine) throw new Error('RiderController needs physics enabled on the scene');
    this.physics = engine as PhysicsEngine;
    this.state = this.spawn();
  }

  get speedKmh(): number {
    const v = this.state.vel;
    return Math.hypot(v.x, v.y, v.z) * 3.6;
  }

  fixedUpdate(input: Input, dt: number): void {
    if (input.wasPressed('respawn')) this.respawn('manual');

    this.input.steer = input.steerAxis();
    this.input.pedal = input.isDown('pedal');
    this.input.brake = input.isDown('brake');

    const s = this.state;
    this.prevPos.x = s.pos.x;
    this.prevPos.y = s.pos.y;
    this.prevPos.z = s.pos.z;
    this.prevHeading = s.heading;

    const wasGrounded = s.grounded;
    const airTime = s.airTime;
    stepRider(s, this.input, this.probe, config.rider, config.physics.gravity, dt);
    if (!wasGrounded && s.grounded) this.events.emit('landed', { airTime });

    const fellOff = s.pos.y < this.killHeight(s.pos.z);
    const pastEnd = s.pos.z > config.terrain.length - 20;
    if (fellOff || pastEnd) this.respawn('outOfBounds');
  }

  respawn(reason: GameEvents['respawned']['reason']): void {
    this.state = this.spawn();
    this.events.emit('respawned', { reason });
  }

  private spawn(): RiderState {
    const { startX, startZ } = config.rider;
    const s = createRiderState(startX, this.spawnHeight(startX, startZ), startZ, 0);
    this.prevPos.x = s.pos.x;
    this.prevPos.y = s.pos.y;
    this.prevPos.z = s.pos.z;
    this.prevHeading = s.heading;
    return s;
  }

  /** Ground under (x, z): average of front and rear wheel raycasts. */
  private readonly probe = (x: number, z: number, heading: number, y: number): GroundSample | null => {
    const { wheelOffset } = config.rider;
    const fx = Math.sin(heading) * wheelOffset;
    const fz = Math.cos(heading) * wheelOffset;
    const front = this.cast(x + fx, z + fz, y);
    const rear = this.cast(x - fx, z - fz, y);
    if (!front && !rear) return null;
    if (!front || !rear) return (front ?? rear) as GroundSample;
    const n = {
      x: front.normal.x + rear.normal.x,
      y: front.normal.y + rear.normal.y,
      z: front.normal.z + rear.normal.z,
    };
    const len = Math.hypot(n.x, n.y, n.z) || 1;
    return {
      height: (front.height + rear.height) / 2,
      normal: { x: n.x / len, y: n.y / len, z: n.z / len },
    };
  };

  private cast(x: number, z: number, y: number): GroundSample | null {
    const { rayUp, rayDown } = config.rider;
    this.from.set(x, y + rayUp, z);
    this.to.set(x, y - rayDown, z);
    this.physics.raycastToRef(this.from, this.to, this.hit);
    if (!this.hit.hasHit) return null;
    const p = this.hit.hitPointWorld;
    const n = this.hit.hitNormalWorld;
    // Make sure the normal points up even if we hit a back face.
    const sign = n.y < 0 ? -1 : 1;
    return { height: p.y, normal: { x: n.x * sign, y: n.y * sign, z: n.z * sign } };
  }
}
