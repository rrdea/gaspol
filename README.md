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
| Respawn | R |
| Debug overlay | F3 |

Tricks score on a clean landing: points × airtime bonus × combo multiplier. Chain clean
tricks within 2 s of ground time to raise the multiplier; a sloppy landing or a crash ends it.

Dev console (dev server only): `__gaspol.race.debugApproachRamp(2)` puts you just before ramp 2.

## Status

- [x] **M1 — Ride down a hill**: test hill with bumps and banks, arcade raycast rider controller
  (slope gravity, pedal/tuck, brake, speed-sensitive steering, launches off crests), chase camera,
  debug overlay. All tuning values live in `src/config.ts`.
- [x] **M2 — Jumps, tricks, crashes**: charged jump with coyote time, launches off ramp lips and
  crests, air flips/spins with a light landing assist, grabs, clean/sloppy/crash landings, trick
  detection + scoring + combos with HUD popups, crashes on bad landings and rock hits, tumble and
  respawn at the last safe point. Six kicker ramps and thin-instanced rocks on the hill.
- [ ] M3 — A real track
- [ ] M4 — Game feel pass
- [ ] M5 — Rivals
- [ ] M6 — Progression and content
- [ ] M7 — Polish and deploy
