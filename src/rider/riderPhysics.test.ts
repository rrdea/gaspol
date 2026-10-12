import { describe, expect, it } from 'vitest';
import { config } from '../config';
import {
  createRiderState,
  groundAccel,
  steerRate,
  stepRider,
  type GroundProbe,
  type RiderInput,
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
const coast: RiderInput = { steer: 0, pedal: false, brake: false };

function ride(probe: GroundProbe, input: RiderInput, seconds: number, startSpeed = 0) {
  const s = createRiderState(0, 0, 0);
  s.speed = startSpeed;
  for (let i = 0; i < seconds / dt; i++) stepRider(s, input, probe, cfg, g, dt);
  return s;
}

describe('rider physics', () => {
  it('accelerates downhill from rest', () => {
    const s = ride(slopeProbe(0.3), coast, 3);
    expect(s.speed).toBeGreaterThan(5);
    expect(s.pos.z).toBeGreaterThan(5);
    expect(s.grounded).toBe(true);
  });

  it('never exceeds top speed', () => {
    const s = ride(slopeProbe(1), { ...coast, pedal: true }, 30);
    expect(s.speed).toBeLessThanOrEqual(cfg.topSpeed);
  });

  it('stays still on flat ground without pedalling', () => {
    const s = ride(flat, coast, 2);
    expect(s.speed).toBe(0);
  });

  it('can pedal on flat ground', () => {
    const s = ride(flat, { ...coast, pedal: true }, 3);
    expect(s.speed).toBeGreaterThan(3);
  });

  it('brakes to a stop', () => {
    const s = ride(slopeProbe(0.2), { ...coast, brake: true }, 3, 20);
    expect(s.speed).toBe(0);
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
    expect(steerRate(1, 0, false, cfg)).toBe(0);
  });

  it('steering right turns towards +X', () => {
    const s = ride(slopeProbe(0.3), { ...coast, steer: 1 }, 2);
    expect(s.heading).toBeGreaterThan(0);
    expect(s.pos.x).toBeGreaterThan(0);
  });

  it('launches off a drop and lands again', () => {
    // Flat until z = 10, then a 3 m step down.
    const step: GroundProbe = (_x, z) => ({ height: z < 10 ? 0 : -3, normal: { x: 0, y: 1, z: 0 } });
    const s = createRiderState(0, 0, 0);
    s.speed = 15;
    let wasAirborne = false;
    for (let i = 0; i < 120; i++) {
      stepRider(s, coast, step, cfg, g, dt);
      if (!s.grounded) wasAirborne = true;
    }
    expect(wasAirborne).toBe(true);
    expect(s.grounded).toBe(true);
    expect(s.pos.y).toBe(-3);
    expect(s.speed).toBeGreaterThan(10);
  });

  it('slope acceleration matches g * sin(angle)', () => {
    const angle = Math.atan(0.3);
    const a = groundAccel(0, -Math.sin(angle), coast, cfg, g);
    expect(a).toBeCloseTo(g * Math.sin(angle));
  });
});
