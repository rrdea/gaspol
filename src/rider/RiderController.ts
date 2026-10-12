// Arcade rider controller. Maps input actions to rider input (ground controls, air
// flips/spins, grabs), casts two rays (front and rear wheel) down onto GROUND-filtered
// Havok colliders for height and normal, and advances the pure riderPhysics step.
// Keeps the previous step's state so the visual can interpolate between fixed steps.

import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsRaycastResult } from '@babylonjs/core/Physics/physicsRaycastResult';
import type { IRaycastQuery } from '@babylonjs/core/Physics/physicsRaycastResult';
import type { PhysicsEngine } from '@babylonjs/core/Physics/v2/physicsEngine';
import type { Scene } from '@babylonjs/core/scene';
import { config, riderPhysicsConfig } from '../config';
import type { Input } from '../core/Input';
import {
  createRiderState,
  stepRider,
  type GroundSample,
  type RiderInput,
  type RiderState,
  type StepEvents,
  type Vec3,
} from './riderPhysics';
import type { GrabName } from './tricks';
import { steerToward } from '../ai/steering';
import type { TrackPath } from '../track/TrackPath';

/**
 * frozen: no movement (countdown). player: keyboard control. autopilot: steers along the
 * track holding pedal (dev/tests). coast: no input, braking (after the finish).
 */
export type ControlMode = 'frozen' | 'player' | 'autopilot' | 'coast';

export class RiderController {
  state: RiderState;
  /** Snapshot of the previous fixed step, for render interpolation. */
  readonly prev = { pos: { x: 0, y: 0, z: 0 } as Vec3, heading: 0, airPitch: 0, airYaw: 0 };
  /** Grab currently held in the air, if any. */
  grab: GrabName | null = null;
  mode: ControlMode = 'player';
  private autopilotHint: number | undefined;

  private readonly physics: PhysicsEngine;
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly hit = new PhysicsRaycastResult();
  private readonly query: IRaycastQuery = {
    membership: config.physics.filterQuery,
    collideWith: config.physics.filterGround,
  };
  private readonly input: RiderInput = { steer: 0, pedal: false, brake: false, jumpHeld: false, pitch: 0, spin: 0 };

  constructor(
    scene: Scene,
    private readonly terrainHeight: (x: number, z: number) => number,
    private readonly path: TrackPath,
  ) {
    const engine = scene.getPhysicsEngine();
    if (!engine) throw new Error('RiderController needs physics enabled on the scene');
    this.physics = engine as PhysicsEngine;
    const start = path.sampleAt(0);
    this.state = createRiderState(start.x, terrainHeight(start.x, start.z), start.z, start.heading);
    this.snapshot();
  }

  get speedKmh(): number {
    const v = this.state.vel;
    return Math.hypot(v.x, v.y, v.z) * 3.6;
  }

  fixedUpdate(input: Input, dt: number): StepEvents {
    this.snapshot();
    if (this.mode === 'frozen') return { tookOff: false, jumped: false, landed: null };
    if (this.mode === 'player') this.readInput(input);
    else this.autoInput();
    return stepRider(this.state, this.input, this.probe, riderPhysicsConfig, dt, this.slopeBelow);
  }

  /** Autopilot (steer along the track, pedal) or coasting (brake) after the finish. */
  private autoInput(): void {
    const i = this.input;
    const s = this.state;
    const ap = config.autopilot;
    const st = steerToward(this.path, s.pos.x, s.pos.z, s.heading, ap.lookahead, ap.gain, 0, this.autopilotHint);
    this.autopilotHint = st.index;
    i.steer = st.steer;
    i.pedal = this.mode === 'autopilot';
    i.brake = this.mode === 'coast' && config.race.finishBrake;
    i.jumpHeld = false;
    i.pitch = 0;
    i.spin = 0;
    this.grab = null;
  }

  /** Puts the rider on the ground at (x, z), facing `heading`, rolling at `speed`. */
  placeAt(x: number, z: number, heading: number, speed: number): void {
    // Start above the terrain and let the ground ray find the real surface (ramps included).
    const s = createRiderState(x, this.terrainHeight(x, z), z, heading);
    const ground = this.probe(x, z, heading, s.pos.y + 1);
    if (ground) {
      s.pos.y = ground.height;
      s.groundNormal = ground.normal;
    }
    s.speed = speed;
    this.state = s;
    this.grab = null;
    this.autopilotHint = undefined;
    this.snapshot();
  }

  private snapshot(): void {
    const s = this.state;
    this.prev.pos.x = s.pos.x;
    this.prev.pos.y = s.pos.y;
    this.prev.pos.z = s.pos.z;
    this.prev.heading = s.heading;
    this.prev.airPitch = s.airPitch;
    this.prev.airYaw = s.airYaw;
  }

  private readInput(input: Input): void {
    const i = this.input;
    const up = input.isDown('pedal');
    const down = input.isDown('brake');
    const steer = input.steerAxis();
    const airborne = this.state.phase === 'airborne';

    i.steer = steer;
    i.jumpHeld = input.isDown('jump');
    i.pedal = up;
    i.brake = down;
    i.pitch = 0;
    i.spin = 0;
    this.grab = null;
    if (!airborne) return;

    if (input.isDown('grab')) {
      // Shift + direction picks a grab instead of rotating.
      if (up) this.grab = 'Superman';
      else if (down) this.grab = 'No-Hander';
      else if (steer !== 0) this.grab = 'Can-Can';
    } else {
      i.pitch = (down ? 1 : 0) - (up ? 1 : 0); // S/↓ = backflip, W/↑ = frontflip
      i.spin = steer;
    }
  }

  /** Ground under (x, z): average of front and rear wheel raycasts. */
  private readonly probe = (x: number, z: number, heading: number, y: number): GroundSample | null => {
    const { wheelOffset } = config.rider;
    const fx = Math.sin(heading) * wheelOffset;
    const fz = Math.cos(heading) * wheelOffset;
    const front = this.cast(x + fx, z + fz, y);
    const rear = this.cast(x - fx, z - fz, y);
    if (!front && !rear) return null;
    if (!front || !rear) {
      const only = (front ?? rear) as GroundSample;
      return { ...only, frontHeight: front ? front.height : -Infinity };
    }
    const n = {
      x: front.normal.x + rear.normal.x,
      y: front.normal.y + rear.normal.y,
      z: front.normal.z + rear.normal.z,
    };
    const len = Math.hypot(n.x, n.y, n.z) || 1;
    return {
      // Highest wheel wins, so the bike rides up onto ramps instead of sinking in.
      height: Math.max(front.height, rear.height),
      normal: { x: n.x / len, y: n.y / len, z: n.z / len },
      frontHeight: front.height,
    };
  };

  /** Pitch of the bare terrain under the rider along its heading (for the air auto-level). */
  private readonly slopeBelow = (x: number, z: number, heading: number): number => {
    const d = config.rider.wheelOffset * 2;
    const fx = Math.sin(heading) * d;
    const fz = Math.cos(heading) * d;
    const rise = this.terrainHeight(x + fx, z + fz) - this.terrainHeight(x - fx, z - fz);
    return Math.atan2(rise, d * 2);
  };

  private cast(x: number, z: number, y: number): GroundSample | null {
    const { rayUp, rayDown } = config.rider;
    this.from.set(x, y + rayUp, z);
    this.to.set(x, y - rayDown, z);
    this.physics.raycastToRef(this.from, this.to, this.hit, this.query);
    if (!this.hit.hasHit) return null;
    const p = this.hit.hitPointWorld;
    const n = this.hit.hitNormalWorld;
    // Make sure the normal points up even if we hit a back face.
    const sign = n.y < 0 ? -1 : 1;
    return { height: p.y, normal: { x: n.x * sign, y: n.y * sign, z: n.z * sign } };
  }
}
