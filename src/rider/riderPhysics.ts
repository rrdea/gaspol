// Arcade rider physics as a pure step function: gravity along the slope, pedal/tuck,
// brake, drag and friction, speed-sensitive steering, and simple ballistic air time.
// No Babylon here: the controller supplies ground samples (from raycasts) through a probe.

import type { RiderConfig } from '../config';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface GroundSample {
  height: number;
  /** Unit ground normal. */
  normal: Vec3;
}

/** Finds the ground under (x, z) for a rider facing `heading`, or null if none in range. */
export type GroundProbe = (x: number, z: number, heading: number, y: number) => GroundSample | null;

export interface RiderInput {
  /** -1 (left) .. 1 (right). */
  steer: number;
  pedal: boolean;
  brake: boolean;
}

export interface RiderState {
  pos: Vec3;
  vel: Vec3;
  /** Yaw in radians; 0 faces +Z (downhill), positive turns towards +X (right). */
  heading: number;
  /** Speed along the ground while grounded, m/s. */
  speed: number;
  /** Smoothed steering input, -1..1. */
  steer: number;
  /** Current yaw rate (rad/s); drives the visual lean. */
  turnRate: number;
  grounded: boolean;
  groundNormal: Vec3;
  airTime: number;
}

export function createRiderState(x: number, y: number, z: number, heading = 0): RiderState {
  return {
    pos: { x, y, z },
    vel: { x: 0, y: 0, z: 0 },
    heading,
    speed: 0,
    steer: 0,
    turnRate: 0,
    grounded: true,
    groundNormal: { x: 0, y: 1, z: 0 },
    airTime: 0,
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
  const lowSpeed = Math.min(speed / cfg.minTurnSpeed, 1);
  const brake = braking ? cfg.brakeTurnBonus : 1;
  return steer * cfg.turnRate * highSpeed * lowSpeed * brake;
}

/** Along-ground acceleration (m/s^2) from slope, pedalling, drag, friction and brakes. */
export function groundAccel(
  speed: number,
  forwardY: number,
  input: RiderInput,
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

function smoothSteer(state: RiderState, input: RiderInput, cfg: RiderConfig, dt: number): void {
  const t = Math.min(1, cfg.steerResponse * dt);
  state.steer += (input.steer - state.steer) * t;
}

function stepGrounded(
  s: RiderState,
  input: RiderInput,
  probe: GroundProbe,
  cfg: RiderConfig,
  gravity: number,
  dt: number,
): void {
  const ground = probe(s.pos.x, s.pos.z, s.heading, s.pos.y);
  if (!ground) {
    s.grounded = false;
    s.airTime = 0;
    return;
  }
  s.groundNormal = ground.normal;

  const fwd = groundForward(s.heading, ground.normal);
  s.speed += groundAccel(s.speed, fwd.y, input, cfg, gravity) * dt;
  s.speed = Math.min(Math.max(s.speed, 0), cfg.topSpeed);

  s.turnRate = steerRate(s.steer, s.speed, input.brake, cfg);
  s.heading += s.turnRate * dt;

  const dir = groundForward(s.heading, ground.normal);
  s.vel = { x: dir.x * s.speed, y: dir.y * s.speed, z: dir.z * s.speed };
  const next = { x: s.pos.x + s.vel.x * dt, y: s.pos.y + s.vel.y * dt, z: s.pos.z + s.vel.z * dt };

  const after = probe(next.x, next.z, s.heading, next.y);
  if (after && after.height >= next.y - cfg.groundSnap) {
    next.y = after.height;
    s.groundNormal = after.normal;
  } else {
    // Ground fell away faster than we follow it: launch.
    s.grounded = false;
    s.airTime = 0;
  }
  s.pos = next;
}

function stepAirborne(
  s: RiderState,
  probe: GroundProbe,
  cfg: RiderConfig,
  gravity: number,
  dt: number,
): void {
  s.airTime += dt;
  s.vel.y -= gravity * dt;

  // A little air steering: rotate heading and horizontal velocity together.
  const hSpeed = Math.hypot(s.vel.x, s.vel.z);
  s.turnRate = steerRate(s.steer, hSpeed, false, cfg) * cfg.airTurnFactor;
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
  if (ground && s.pos.y <= ground.height) {
    s.pos.y = ground.height;
    s.groundNormal = ground.normal;
    const dir = groundForward(s.heading, ground.normal);
    const along = s.vel.x * dir.x + s.vel.y * dir.y + s.vel.z * dir.z;
    s.speed = Math.min(Math.max(along * cfg.landingSpeedKeep, 0), cfg.topSpeed);
    s.vel = { x: dir.x * s.speed, y: dir.y * s.speed, z: dir.z * s.speed };
    s.grounded = true;
  }
}

/** Advances the rider by one fixed step. Mutates and returns `state`. */
export function stepRider(
  state: RiderState,
  input: RiderInput,
  probe: GroundProbe,
  cfg: RiderConfig,
  gravity: number,
  dt: number,
): RiderState {
  smoothSteer(state, input, cfg, dt);
  if (state.grounded) stepGrounded(state, input, probe, cfg, gravity, dt);
  else stepAirborne(state, probe, cfg, gravity, dt);
  return state;
}
