# Gas Pol

Arcade 3D downhill mountain bike racing in the browser ("gas pol" = Indonesian slang for full throttle).
Built with TypeScript, Vite, Babylon.js and Havok.

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (Vitest)
npm run build    # static build in dist/
```

## Controls

| Action | Keys |
|---|---|
| Steer | A/D or ←/→ |
| Pedal / tuck | W or ↑ |
| Brake | S or ↓ |
| Jump (hold to charge) | Space |
| Backflip / frontflip (air) | S/↓ / W/↑ |
| Spin (air) | A/D or ←/→ |
| Grab (air) | Shift + W (Superman), Shift + S (No-Hander), Shift + A/D (Can-Can) |
| Respawn (at last checkpoint) | R |
| Retry (results screen) | Enter |
| Debug overlay | F3 |

Tricks score on a clean landing: points × airtime bonus × combo multiplier. Chain clean
tricks within 2 s of ground time to raise the multiplier; a sloppy landing or a crash ends it.

Race: 3-2-1-GAS POL! countdown, then ride through every checkpoint gate in order to the finish.
Your best time and trick score per track are saved in `localStorage` (`gaspol_save_v1`).

Dev console (dev server only): `__gaspol.race.debugApproachRamp(2)` puts you just before ramp 2;
`__gaspol.race.autopilot = true` (then Enter on the results, or reload) lets the autopilot ride.

## Status

- [x] **M1 — Ride down a hill**: test hill with bumps and banks, arcade raycast rider controller
  (slope gravity, pedal/tuck, brake, speed-sensitive steering, launches off crests), chase camera,
  debug overlay. All tuning values live in `src/config.ts`.
- [x] **M2 — Jumps, tricks, crashes**: charged jump with coyote time, launches off ramp lips and
  crests, air flips/spins with a light landing assist, grabs, clean/sloppy/crash landings, trick
  detection + scoring + combos with HUD popups, crashes on bad landings and rock hits, tumble and
  respawn at the last safe point. Six kicker ramps and thin-instanced rocks on the hill.
- [x] **M3 — A real track**: Bukit Hijau built from a spline (terrain ribbon in culled chunks, banks,
  bumps), thin-instanced trees and rocks with collisions, ramps, ordered checkpoint gates, finish
  line, race timer and splits, out-of-bounds respawn at the last checkpoint, countdown, results
  screen and saved best time. A full autopilot run takes about 82 s.
- [ ] M4 — Game feel pass
- [ ] M5 — Rivals
- [ ] M6 — Progression and content
- [ ] M7 — Polish and deploy
