// Arcade rider physics as a pure step function: gravity along the slope, pedal/tuck,
// brake, drag and friction, speed-sensitive steering, charged jumps with coyote time,
// air flips/spins, the landing check, and the crashed slide.
// No Babylon here: the controller supplies ground samples (from raycasts) through a probe.

import type { Config } from '../config';
import { clamp, offFromMultiple } from '../core/math';
import { classifyLanding, landingError, type LandingQuality } from './landing';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface GroundSample {
  height: number;
  /** Unit ground normal. */
  normal: Vec3;
  /** Ground height under the front wheel (-Infinity if its ray found nothing). Used to detect lips. */
  frontHeight?: number;
}

/** Finds the ground under (x, z) for a rider facing `heading`, or null if none in range. */
export type GroundProbe = (x: number, z: number, heading: number, y: number) => GroundSample | null;

/** Pitch (radians, negative = downhill) of the terrain below (x, z) along `heading`. Air assist only. */
export type SlopeBelow = (x: number, z: number, heading: number) => number;

export interface RiderInput {
  /** -1 (left) .. 1 (right). */
  steer: number;
  pedal: boolean;
  brake: boolean;
  jumpHeld: boolean;
  /** Air pitch input: 1 = backflip, -1 = frontflip. */
  pitch: number;
  /** Air spin input: 1 = clockwise (right), -1 = left. */
  spin: number;
}

export type RiderPhase = 'grounded' | 'airborne' | 'crashed';

export interface RiderState {
  phase: RiderPhase;
  pos: Vec3;
  vel: Vec3;
  /** Travel yaw in radians; 0 faces +Z (downhill), positive turns towards +X (right). */
  heading: number;
  /** Speed along the ground while grounded, m/s. */
  speed: number;
  /** Smoothed steering input, -1..1. */
  steer: number;
  /** Current yaw rate (rad/s); drives the visual lean. */
  turnRate: number;
  groundNormal: Vec3;
  airTime: number;
  /** Seconds the jump button has been held (0..maxChargeTime). */
  jumpCharge: number;
  jumpWasHeld: boolean;
  /** Seconds since leaving the ground without jumping (for coyote time); Infinity once used. */
  coyote: number;
  /** Body pitch in the air (absolute, radians, positive = nose up). */
  airPitch: number;
  /** Body spin relative to the travel heading (radians). */
  airYaw: number;
  /** Body pitch at take-off, so tricks count only rotation done in the air. */
  takeoffPitch: number;
  pitchVel: number;
  yawVel: number;
}

export interface LandingInfo {
  quality: LandingQuality;
  /** Landing error in radians. */
  error: number;
  airTime: number;
  /** Pitch rotated since take-off (positive = backwards). */
  pitch: number;
  /** Spin rotated since take-off. */
  yaw: number;
}

export interface StepEvents {
  tookOff: boolean;
  jumped: boolean;
  landed: LandingInfo | null;
}

export type PhysicsConfig = Pick<Config, 'rider' | 'jump' | 'air' | 'landing' | 'crash'> & {
  gravity: number;
};

type RiderConfig = Config['rider'];

export function createRiderState(x: number, y: number, z: number, heading = 0): RiderState {
  return {
    phase: 'grounded',
    pos: { x, y, z },
    vel: { x: 0, y: 0, z: 0 },
    heading,
    speed: 0,
    steer: 0,
    turnRate: 0,
    groundNormal: { x: 0, y: 1, z: 0 },
    airTime: 0,
    jumpCharge: 0,
    jumpWasHeld: false,
    coyote: Infinity,
    airPitch: 0,
    airYaw: 0,
    takeoffPitch: 0,
    pitchVel: 0,
    yawVel: 0,
  };
}

/** Unit forward direction for a heading, flattened onto the ground plane with normal n. */
export function groundForward(heading: number, n: Vec3): Vec3 {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const d = fx * n.x + fz * n.z;
  const px = fx - d * n.x;
  const py = -d * n.y;
  const pz = fz - d * n.z;
  const len = Math.hypot(px, py, pz) || 1;
  return { x: px / len, y: py / len, z: pz / len };
}

/** Yaw rate for a given steer value, speed and brake state. */
export function steerRate(steer: number, speed: number, braking: boolean, cfg: RiderConfig): number {
  const speedT = Math.min(speed / cfg.topSpeed, 1);
  const highSpeed = 1 + (cfg.highSpeedTurnFactor - 1) * speedT;
  const lowSpeed = Math.max(Math.min(speed / cfg.minTurnSpeed, 1), cfg.minTurnFactor);
  const brake = braking ? cfg.brakeTurnBonus : 1;
  return steer * cfg.turnRate * highSpeed * lowSpeed * brake;
}

/** Along-ground acceleration (m/s^2) from slope, pedalling, drag, friction and brakes. */
export function groundAccel(
  speed: number,
  forwardY: number,
  input: Pick<RiderInput, 'pedal' | 'brake'>,
  cfg: RiderConfig,
  gravity: number,
): number {
  let accel = -gravity * forwardY;
  let drag = cfg.dragCoef;
  if (input.pedal) {
    accel += cfg.pedalAccel * Math.max(0, 1 - speed / cfg.pedalMaxSpeed);
    if (speed > cfg.pedalMaxSpeed) drag *= cfg.tuckDragFactor;
  }
  accel -= drag * speed * speed;
  if (speed > 0) accel -= cfg.rollingFriction;
  if (input.brake) accel -= cfg.brakeDecel;
  return accel;
}

/** Jump take-off speed for a given charge time. */
export function jumpSpeed(charge: number, cfg: Config['jump']): number {
  const t = clamp(charge / cfg.maxChargeTime, 0, 1);
  return cfg.minJumpSpeed + (cfg.maxJumpSpeed - cfg.minJumpSpeed) * t;
}

/** Pitch of a velocity vector (positive = rising). */
function travelPitch(v: Vec3): number {
  const h = Math.hypot(v.x, v.z);
  return Math.atan2(v.y, h);
}

function smoothSteer(s: RiderState, input: RiderInput, cfg: RiderConfig, dt: number): void {
  const t = Math.min(1, cfg.steerResponse * dt);
  s.steer += (input.steer - s.steer) * t;
}

function leaveGround(s: RiderState, jumped: boolean): void {
  s.phase = 'airborne';
  s.airTime = 0;
  s.coyote = jumped ? Infinity : 0;
  const pitch = travelPitch(s.vel);
  s.airPitch = pitch;
  s.takeoffPitch = pitch;
  s.airYaw = 0;
  s.pitchVel = 0;
  s.yawVel = 0;
}

/** Handles jump charging and release. Returns true if a jump happened. */
function handleJump(s: RiderState, input: RiderInput, cfg: PhysicsConfig, dt: number): boolean {
  const canJump = s.phase === 'grounded' || (s.phase === 'airborne' && s.coyote <= cfg.jump.coyoteTime);
  let jumped = false;
  if (input.jumpHeld) {
    if (canJump) s.jumpCharge = Math.min(s.jumpCharge + dt, cfg.jump.maxChargeTime);
  } else if (s.jumpWasHeld && canJump) {
    const v = jumpSpeed(s.jumpCharge, cfg.jump);
    const n = s.groundNormal;
    if (s.phase === 'airborne') s.vel.y = Math.max(s.vel.y, 0);
    s.vel.x += n.x * v;
    s.vel.y += n.y * v;
    s.vel.z += n.z * v;
    leaveGround(s, true);
    jumped = true;
  }
  if (!input.jumpHeld) s.jumpCharge = 0;
  s.jumpWasHeld = input.jumpHeld;
  return jumped;
}

function stepGrounded(s: RiderState, input: RiderInput, probe: GroundProbe, cfg: PhysicsConfig, dt: number): boolean {
  const rc = cfg.rider;
  const ground = probe(s.pos.x, s.pos.z, s.heading, s.pos.y);
  if (!ground) {
    leaveGround(s, false);
    return true;
  }
  s.groundNormal = ground.normal;

  const fwd = groundForward(s.heading, ground.normal);
  s.speed += groundAccel(s.speed, fwd.y, input, rc, cfg.gravity) * dt;
  s.speed = clamp(s.speed, 0, rc.topSpeed);

  s.turnRate = steerRate(s.steer, s.speed, input.brake, rc);
  s.heading += s.turnRate * dt;

  const dir = groundForward(s.heading, ground.normal);
  s.vel = { x: dir.x * s.speed, y: dir.y * s.speed, z: dir.z * s.speed };
  const next = { x: s.pos.x + s.vel.x * dt, y: s.pos.y + s.vel.y * dt, z: s.pos.z + s.vel.z * dt };

  const after = probe(next.x, next.z, s.heading, next.y);
  s.pos = next;
  // Where the front wheel would be if we kept going straight.
  const frontY = next.y + dir.y * rc.wheelOffset;
  const frontLost = after?.frontHeight !== undefined && after.frontHeight < frontY - rc.groundSnap;
  if (after && after.height >= next.y - rc.groundSnap && !(frontLost && s.speed > rc.minLaunchSpeed)) {
    s.pos.y = after.height;
    s.groundNormal = after.normal;
    return false;
  }
  // Ground fell away faster than we follow it (a ramp lip or crest): launch with our current velocity.
  leaveGround(s, false);
  return true;
}

/**
 * Angular velocity target for one air axis: player input; else a gentle auto-level when
 * close to a landable orientation (`restOffset` away); else stop rotating.
 */
function airAxisTarget(input: number, rate: number, restOffset: number, cfg: Config['air']): number {
  if (input !== 0) return input * rate;
  if (Math.abs(restOffset) > cfg.autoLevelZone) return 0;
  return clamp(-restOffset * cfg.autoLevelGain, -cfg.autoLevelMaxRate, cfg.autoLevelMaxRate);
}

function stepAirborne(
  s: RiderState,
  input: RiderInput,
  probe: GroundProbe,
  slopeBelow: SlopeBelow | undefined,
  cfg: PhysicsConfig,
  dt: number,
): LandingInfo | null {
  const air = cfg.air;
  s.airTime += dt;
  s.coyote += dt;
  s.vel.y -= cfg.gravity * dt;

  // Flips and spins. Without input the bike drifts towards the slope below (or its travel
  // pitch if unknown) and the nearest 180°, which makes clean landings easier.
  const k = Math.min(1, air.rotResponse * dt);
  const restPitch = slopeBelow ? slopeBelow(s.pos.x, s.pos.z, s.heading) : travelPitch(s.vel);
  const pitchRest = offFromMultiple(s.airPitch - restPitch, Math.PI * 2);
  const yawRest = offFromMultiple(s.airYaw, Math.PI);
  s.pitchVel += (airAxisTarget(input.pitch, air.flipRate, pitchRest, air) - s.pitchVel) * k;
  s.yawVel += (airAxisTarget(input.spin, air.spinRate, yawRest, air) - s.yawVel) * k;
  s.airPitch += s.pitchVel * dt;
  s.airYaw += s.yawVel * dt;

  // A little air steering: rotate heading and horizontal velocity together.
  const hSpeed = Math.hypot(s.vel.x, s.vel.z);
  s.turnRate = steerRate(s.steer, hSpeed, false, cfg.rider) * cfg.rider.airTurnFactor;
  const dYaw = s.turnRate * dt;
  s.heading += dYaw;
  const c = Math.cos(dYaw);
  const sn = Math.sin(dYaw);
  const vx = s.vel.x * c + s.vel.z * sn;
  const vz = -s.vel.x * sn + s.vel.z * c;
  s.vel.x = vx;
  s.vel.z = vz;

  s.pos = { x: s.pos.x + s.vel.x * dt, y: s.pos.y + s.vel.y * dt, z: s.pos.z + s.vel.z * dt };

  const ground = probe(s.pos.x, s.pos.z, s.heading, s.pos.y);
  if (!ground || s.pos.y > ground.height) return null;

  // Touchdown.
  const error = landingError(s.heading, s.airPitch, s.airYaw, ground.normal);
  const quality = classifyLanding(error, cfg.landing);
  const info: LandingInfo = {
    quality,
    error,
    airTime: s.airTime,
    pitch: s.airPitch - s.takeoffPitch,
    yaw: s.airYaw,
  };

  s.pos.y = ground.height;
  s.groundNormal = ground.normal;
  // Ride on in the direction of travel (a landed 180 auto-reverts).
  if (hSpeed > 1) s.heading = Math.atan2(s.vel.x, s.vel.z);
  const dir = groundForward(s.heading, ground.normal);
  const along = s.vel.x * dir.x + s.vel.y * dir.y + s.vel.z * dir.z;
  const lossT = Math.min(1, s.airTime / cfg.rider.landingLossAirTime);
  let keep = 1 - (1 - cfg.rider.landingSpeedKeep) * lossT;
  if (quality === 'sloppy') keep *= cfg.landing.sloppySpeedKeep;
  s.speed = clamp(along * keep, 0, cfg.rider.topSpeed);
  s.vel = { x: dir.x * s.speed, y: dir.y * s.speed, z: dir.z * s.speed };
  s.airPitch = 0;
  s.airYaw = 0;
  s.pitchVel = 0;
  s.yawVel = 0;
  s.phase = quality === 'crash' ? 'crashed' : 'grounded';
  if (quality === 'crash') s.speed = Math.hypot(s.vel.x, s.vel.z, s.vel.y);
  return info;
}

/** Tumbling after a crash: slide to a stop along the ground. */
function stepCrashed(s: RiderState, probe: GroundProbe, cfg: PhysicsConfig, dt: number): void {
  s.turnRate = 0;
  s.speed = Math.max(0, s.speed - cfg.crash.crashFriction * dt);
  const h = Math.hypot(s.vel.x, s.vel.z) || 1;
  s.vel = { x: (s.vel.x / h) * s.speed, y: 0, z: (s.vel.z / h) * s.speed };
  s.pos = { x: s.pos.x + s.vel.x * dt, y: s.pos.y, z: s.pos.z + s.vel.z * dt };
  const ground = probe(s.pos.x, s.pos.z, s.heading, s.pos.y);
  if (ground) {
    s.pos.y = ground.height;
    s.groundNormal = ground.normal;
  }
}

/** Puts the rider into the crashed state (bad landing, hard hit). */
export function crashRider(s: RiderState): void {
  s.phase = 'crashed';
  s.speed = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
  s.jumpCharge = 0;
  s.pitchVel = 0;
  s.yawVel = 0;
}

/** Advances the rider by one fixed step. Mutates `state` and reports what happened. */
export function stepRider(
  state: RiderState,
  input: RiderInput,
  probe: GroundProbe,
  cfg: PhysicsConfig,
  dt: number,
  slopeBelow?: SlopeBelow,
): StepEvents {
  const events: StepEvents = { tookOff: false, jumped: false, landed: null };
  if (state.phase === 'crashed') {
    stepCrashed(state, probe, cfg, dt);
    return events;
  }
  smoothSteer(state, input, cfg.rider, dt);
  events.jumped = handleJump(state, input, cfg, dt);
  if (state.phase === 'grounded') {
    events.tookOff = stepGrounded(state, input, probe, cfg, dt);
  } else {
    events.landed = stepAirborne(state, input, probe, slopeBelow, cfg, dt);
  }
  events.tookOff ||= events.jumped;
  return events;
}
