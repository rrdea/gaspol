import { describe, expect, it } from 'vitest';
import { config, riderPhysicsConfig as pcfg } from '../config';
import {
  createRiderState,
  groundAccel,
  steerRate,
  stepRider,
  crashRider,
  type GroundProbe,
  type RiderInput,
  type RiderState,
} from './riderPhysics';

const cfg = config.rider;
const g = config.physics.gravity;
const dt = config.physics.fixedDt;

/** Infinite plane sloping down along +Z with the given rise/run. */
function slopeProbe(slope: number): GroundProbe {
  const len = Math.hypot(slope, 1);
  const normal = { x: 0, y: 1 / len, z: slope / len };
  return (_x, z) => ({ height: -z * slope, normal });
}

const flat: GroundProbe = () => ({ height: 0, normal: { x: 0, y: 1, z: 0 } });
const coast: RiderInput = { steer: 0, pedal: false, brake: false, jumpHeld: false, pitch: 0, spin: 0 };

function ride(probe: GroundProbe, input: RiderInput, seconds: number, startSpeed = 0) {
  const s = createRiderState(0, 0, 0);
  s.speed = startSpeed;
  for (let i = 0; i < seconds / dt; i++) stepRider(s, input, probe, pcfg, dt);
  return s;
}

/** Holds jump for `hold` seconds on flat ground, releases, and returns the peak height. */
function jumpPeak(hold: number): number {
  const s = createRiderState(0, 0, 0);
  s.speed = 5;
  for (let i = 0; i < Math.round(hold / dt); i++) stepRider(s, { ...coast, jumpHeld: true }, flat, pcfg, dt);
  let peak = 0;
  for (let i = 0; i < 120; i++) {
    stepRider(s, coast, flat, pcfg, dt);
    peak = Math.max(peak, s.pos.y);
  }
  return peak;
}

/** Runs until the rider lands; returns the landing info. */
function airUntilLanding(s: RiderState, input: RiderInput, probe: GroundProbe) {
  for (let i = 0; i < 600; i++) {
    const ev = stepRider(s, input, probe, pcfg, dt);
    if (ev.landed) return ev.landed;
  }
  throw new Error('never landed');
}

describe('rider physics: riding', () => {
  it('accelerates downhill from rest', () => {
    const s = ride(slopeProbe(0.3), coast, 3);
    expect(s.speed).toBeGreaterThan(5);
    expect(s.pos.z).toBeGreaterThan(5);
    expect(s.phase).toBe('grounded');
  });

  it('never exceeds top speed', () => {
    const s = ride(slopeProbe(1), { ...coast, pedal: true }, 30);
    expect(s.speed).toBeLessThanOrEqual(cfg.topSpeed);
  });

  it('stays still on flat ground without pedalling', () => {
    expect(ride(flat, coast, 2).speed).toBe(0);
  });

  it('can pedal on flat ground', () => {
    expect(ride(flat, { ...coast, pedal: true }, 3).speed).toBeGreaterThan(3);
  });

  it('brakes to a stop', () => {
    expect(ride(slopeProbe(0.2), { ...coast, brake: true }, 3, 20).speed).toBe(0);
  });

  it('tucking reaches a higher terminal speed than coasting', () => {
    const coasting = ride(slopeProbe(0.27), coast, 40);
    const tucking = ride(slopeProbe(0.27), { ...coast, pedal: true }, 40);
    expect(tucking.speed).toBeGreaterThan(coasting.speed + 1);
  });

  it('turns slower at high speed and sharper while braking', () => {
    const slow = steerRate(1, 6, false, cfg);
    const fast = steerRate(1, cfg.topSpeed, false, cfg);
    expect(fast).toBeLessThan(slow);
    expect(steerRate(1, 6, true, cfg)).toBeGreaterThan(slow);
    // A stopped bike can still turn slowly (to get unstuck facing uphill).
    expect(steerRate(1, 0, false, cfg)).toBeCloseTo(cfg.turnRate * cfg.minTurnFactor);
  });

  it('steering right turns towards +X', () => {
    const s = ride(slopeProbe(0.3), { ...coast, steer: 1 }, 2);
    expect(s.heading).toBeGreaterThan(0);
    expect(s.pos.x).toBeGreaterThan(0);
  });

  it('slope acceleration matches g * sin(angle)', () => {
    const angle = Math.atan(0.3);
    expect(groundAccel(0, -Math.sin(angle), coast, cfg, g)).toBeCloseTo(g * Math.sin(angle));
  });
});

describe('rider physics: air', () => {
  it('launches off a drop and lands clean', () => {
    const step: GroundProbe = (_x, z) => ({ height: z < 10 ? 0 : -3, normal: { x: 0, y: 1, z: 0 } });
    const s = createRiderState(0, 0, 0);
    s.speed = 15;
    let tookOff = false;
    let landing = null;
    for (let i = 0; i < 120; i++) {
      const ev = stepRider(s, coast, step, pcfg, dt);
      tookOff ||= ev.tookOff;
      landing ??= ev.landed;
    }
    expect(tookOff).toBe(true);
    expect(landing?.quality).toBe('clean');
    expect(s.phase).toBe('grounded');
    expect(s.pos.y).toBe(-3);
    expect(s.speed).toBeGreaterThan(10);
  });

  it('launches off a ramp lip at the lip angle', () => {
    // 30° kicker from z = 0 to z = 4, flat ground (lower) after it.
    const rampH = (z: number) => (z >= 0 && z < 4 ? z * Math.tan(Math.PI / 6) : 0);
    const n30 = { x: 0, y: Math.cos(Math.PI / 6), z: -Math.sin(Math.PI / 6) };
    const up = { x: 0, y: 1, z: 0 };
    const off = cfg.wheelOffset;
    const ramp: GroundProbe = (_x, z) => ({
      height: Math.max(rampH(z + off), rampH(z - off)),
      normal: rampH(z) > 0 ? n30 : up,
      frontHeight: rampH(z + off),
    });
    const s = createRiderState(0, 0, -3);
    s.speed = 15;
    let launchVy = 0;
    for (let i = 0; i < 60 && launchVy === 0; i++) {
      if (stepRider(s, coast, ramp, pcfg, dt).tookOff) launchVy = s.vel.y;
    }
    expect(launchVy).toBeGreaterThan(5); // ~15 m/s × sin 30°
  });

  it('a charged jump goes higher than a tap', () => {
    const tap = jumpPeak(dt);
    const full = jumpPeak(config.jump.maxChargeTime);
    expect(tap).toBeGreaterThan(0.3);
    expect(full).toBeGreaterThan(tap * 2);
  });

  it('allows a jump in coyote time but not after', () => {
    const tryJumpAfterLeaving = (delay: number) => {
      // A cliff edge at z = 1: ground disappears (probe returns null) beyond it.
      const cliff: GroundProbe = (_x, z) => (z < 1 ? { height: 0, normal: { x: 0, y: 1, z: 0 } } : null);
      const s = createRiderState(0, 0, 0);
      s.speed = 10;
      let i = 0;
      while (s.phase === 'grounded' && i++ < 100) stepRider(s, coast, cliff, pcfg, dt);
      for (let t = 0; t < delay; t += dt) stepRider(s, coast, cliff, pcfg, dt);
      stepRider(s, { ...coast, jumpHeld: true }, cliff, pcfg, dt);
      return stepRider(s, coast, cliff, pcfg, dt).jumped;
    };
    expect(tryJumpAfterLeaving(0)).toBe(true);
    expect(tryJumpAfterLeaving(config.jump.coyoteTime + 0.1)).toBe(false);
  });

  it('holding backflip input builds positive pitch', () => {
    const s = createRiderState(0, 50, 0);
    s.phase = 'airborne';
    s.vel = { x: 0, y: 5, z: 10 };
    for (let i = 0; i < 30; i++) stepRider(s, { ...coast, pitch: 1 }, () => null, pcfg, dt);
    expect(s.airPitch).toBeGreaterThan(1);
    expect(s.pitchVel).toBeGreaterThan(0);
  });

  it('a full backflip lands clean and reports ~360° of pitch', () => {
    const s = createRiderState(0, 0, 0);
    s.phase = 'airborne';
    s.vel = { x: 0, y: 8, z: 10 };
    // Hold backflip until most of a rotation is done, then let auto-level finish it.
    let i = 0;
    while (s.airPitch < Math.PI * 1.75 && i++ < 200) stepRider(s, { ...coast, pitch: 1 }, flat, pcfg, dt);
    const landing = airUntilLanding(s, coast, flat);
    expect(landing.quality).toBe('clean');
    expect(landing.pitch).toBeGreaterThan(Math.PI * 1.7);
  });

  it('an over-rotated landing crashes', () => {
    const s = createRiderState(0, 0, 0);
    s.phase = 'airborne';
    s.vel = { x: 0, y: 3, z: 10 }; // ~0.6 s of air: about half a frontflip
    const landing = airUntilLanding(s, { ...coast, pitch: -1 }, flat);
    expect(landing.quality).toBe('crash');
    expect(s.phase).toBe('crashed');
  });
});

describe('rider physics: crash', () => {
  it('a crashed rider slides to a stop and ignores input', () => {
    const s = createRiderState(0, 0, 0);
    s.vel = { x: 0, y: 0, z: 15 };
    crashRider(s);
    for (let i = 0; i < 120; i++) stepRider(s, { ...coast, pedal: true, jumpHeld: true }, flat, pcfg, dt);
    expect(s.phase).toBe('crashed');
    expect(s.speed).toBe(0);
    expect(s.pos.z).toBeGreaterThan(1);
  });
});
