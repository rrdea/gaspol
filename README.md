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

## Controls (M1)

| Action | Keys |
|---|---|
| Steer | A/D or ←/→ |
| Pedal / tuck | W or ↑ |
| Brake | S or ↓ |
| Respawn | R |
| Debug overlay | F3 |

## Status

- [x] **M1 — Ride down a hill**: test hill with bumps and banks, arcade raycast rider controller
  (slope gravity, pedal/tuck, brake, speed-sensitive steering, launches off crests), chase camera,
  debug overlay. All tuning values live in `src/config.ts`.
- [ ] M2 — Jumps, tricks, crashes
- [ ] M3 — A real track
- [ ] M4 — Game feel pass
- [ ] M5 — Rivals
- [ ] M6 — Progression and content
- [ ] M7 — Polish and deploy
