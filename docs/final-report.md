# Final Report

## Outcome

Built a new VibeJam 2026 magic duel in this repository with:

- Three.js client
- Colyseus server
- local 3D lobby with `1v1 Duel` and `2v2 Team Duel` portals
- public mode-filtered Colyseus matchmaking through `magic_match`
- shared spell/constants layer
- voice casting with keyboard fallback
- server-validated spells, mana, cooldowns, projectiles, damage, and dash clamping
- VibeJam widget in `client/index.html`
- no login/signup
- no loading screen
- lightweight primitive-only visuals

The old prototype was copied into `_legacy_snapshot/original-prototype-copy` and used only as read-only reference.

## Run Commands

```bash
npm install
npm run dev
```

Client: `http://localhost:5173`  
Server: `ws://localhost:3001`

Separate terminals:

```bash
npm run dev:server
npm run dev:client
```

Checks:

```bash
npm run test --workspace server
npm run typecheck
npm run build
```

## Verification

Fresh checks run:

- `npm run test --workspace server`: passed, 4 test files / 11 tests.
- `npm run typecheck`: passed for server and client.
- `npm run build`: passed for server and client.
- Production smoke on a temporary local port: built server served `/health`; two `1v1` clients joined the same room and reached `PLAYING`; four `2v2` clients joined the same room and reached `PLAYING`; 2v2 teams synced as `AABB`.
- Browser smoke on built production server: lobby canvas rendered, `1v1 Duel` and `2v2 Team Duel` portal labels were visible, debug overlay showed `scene lobby`, the VibeJam widget rendered, and console had no messages.
- Widget check: `client/index.html` contains `https://vibej.am/2026/widget.js`.
- Snapshot check: `_legacy_snapshot/original-prototype-copy` exists.

Build size note:

- Client build produced 3 files in `client/dist`, total about 650 KB raw.
- Main JS was about 644.58 KB minified / 172.42 KB gzip.
- Vite warned that the JS chunk is over 500 KB, mainly from Three.js + Colyseus. No large textures, models, audio, FBX, GLB, or splat files are loaded by the game.

Audit note:

- `npm audit --omit=dev` reports 3 moderate transitive advisories through Colyseus 0.16's `nanoid` dependency.
- The suggested automatic fix requires a breaking upgrade to Colyseus 0.17 while the compatible browser client package in use is `colyseus.js` 0.16.
- The game code does not call `nanoid` directly.

## Compliance

- Required widget: present.
- New game project in current repo: yes.
- Old prototype modified: no.
- Login/signup: none.
- Free-to-play gate: none.
- Loading screen: none.
- Multiplayer: Colyseus `magic_match`, mode-filtered `1v1` and `2v2`.
- 1v1: required players `2`, max clients `2`.
- 2v2: required players `4`, max clients `4`, teams assigned `A/B/A/B`, friendly fire disabled.
- Voice commands: `ignis`, `gelu`, `lux`, `umbra`.
- Keyboard fallback: `1`, `2`, `3`, `4`.
- Server authority: HP, mana, cooldowns, projectile hits, damage, and dash bounds.
- SuperSplat/Gaussian Splat: not integrated.

## Browser Artifacts

Screenshots from smoke testing:

- `logs/smoke-home.png`
- `logs/arcane-tab0-match.png`
- `logs/arcane-tab1-match.png`
