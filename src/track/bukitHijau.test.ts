// Integration test (pure code, no browser): ride Bukit Hijau from the start line to the
// finish with the autopilot holding pedal, on an analytic ground probe built from
// TrackTerrain (ramps excluded). Proves the M3 target: a full run takes 60-120 s.

import { describe, expect, it } from 'vitest';
import { config, riderPhysicsConfig } from '../config';
import { steerToward } from '../ai/steering';
import { createRiderState, stepRider, type GroundProbe, type RiderInput } from '../rider/riderPhysics';
import { TrackPath } from './TrackPath';
import { TrackTerrain } from './TrackTerrain';
import { bukitHijau, gatePositions } from './TrackData';

describe('Bukit Hijau full run', () => {
  it('takes 60-120 s with the autopilot and stays in bounds', () => {
    const path = new TrackPath(bukitHijau.points, config.track.sampleStep);
    const terrain = new TrackTerrain(path, config.track, bukitHijau.startS);
    const h = (x: number, z: number) => terrain.heightAt(x, z);
    const e = 0.5;
    const off = config.rider.wheelOffset;
    const probe: GroundProbe = (x, z, heading) => {
      const fx = Math.sin(heading) * off;
      const fz = Math.cos(heading) * off;
      const front = h(x + fx, z + fz);
      const rear = h(x - fx, z - fz);
      const nx = -(h(x + e, z) - h(x - e, z)) / (2 * e);
      const nz = -(h(x, z + e) - h(x, z - e)) / (2 * e);
      const len = Math.hypot(nx, 1, nz);
      return { height: Math.max(front, rear), normal: { x: nx / len, y: 1 / len, z: nz / len }, frontHeight: front };
    };
    const slopeBelow = (x: number, z: number, heading: number) => {
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      return Math.atan2(h(x + fx, z + fz) - h(x - fx, z - fz), 2);
    };

    const gates = gatePositions(bukitHijau, path.length - config.track.finishRunout);
    const finishS = gates[gates.length - 1];
    const start = path.sampleAt(bukitHijau.startS);
    const s = createRiderState(start.x, h(start.x, start.z), start.z, start.heading);
    const input: RiderInput = { steer: 0, pedal: true, brake: false, jumpHeld: false, pitch: 0, spin: 0 };
    const dt = config.physics.fixedDt;
    const ap = config.autopilot;

    let t = 0;
    let hint: number | undefined;
    let progress = bukitHijau.startS;
    let maxLateral = 0;
    let crashes = 0;
    while (t < 200 && progress < finishS) {
      const st = steerToward(path, s.pos.x, s.pos.z, s.heading, ap.lookahead, ap.gain, 0, hint);
      hint = st.index;
      input.steer = st.steer;
      const ev = stepRider(s, input, probe, riderPhysicsConfig, dt, slopeBelow);
      if (ev.landed?.quality === 'crash') crashes++;
      const p = path.project(s.pos.x, s.pos.z, hint);
      progress = p.s;
      maxLateral = Math.max(maxLateral, Math.abs(p.lateral));
      t += dt;
    }

    expect(progress).toBeGreaterThanOrEqual(finishS);
    expect(t).toBeGreaterThan(60);
    expect(t).toBeLessThan(120);
    expect(maxLateral).toBeLessThan(config.track.trailHalfWidth);
    expect(crashes).toBe(0);
    console.log(`Bukit Hijau autopilot run: ${t.toFixed(1)} s over ${(finishS - bukitHijau.startS).toFixed(0)} m`);
  });
});
