# Migration From Old Prototype

The old prototype was snapshotted to `_legacy_snapshot/original-prototype-copy` and inspected from that copy only. The original folder at `C:\Users\franc\OneDrive\Escritorio\VibeJam` was not modified.

## Snapshot Notes

- Snapshot destination: `_legacy_snapshot/original-prototype-copy`
- Excluded heavy/generated folders: `node_modules`, `dist`, `build`, `.vite`, `.cache`, `coverage`, `.git`, `logs`, `tmp`, `temp`, `.turbo`
- The copied prototype includes large FBX source assets under `ASSETS/3d-models`; these are retained only as reference material and are not used by the new jam build.

## Framework And Package Manager

- Root project name: `arcane-alley`
- Package manager: `pnpm`
- Client: Vite + TypeScript + Three.js
- Server: Node + TypeScript + raw `ws`
- Shared package: `packages/shared`, exported as `@arcane/shared`

## Entry Points And Scripts

- Client entry point: `apps/client/src/main.ts`
- Client HTML: `apps/client/index.html`
- Server entry point: `apps/server/src/index.ts`
- Root scripts included `pnpm dev`, `pnpm dev:client`, `pnpm dev:server`, `pnpm build`, and `pnpm preview`.

## Movement Code

- Movement lived mainly in `apps/client/src/input.ts` and `apps/server/src/duel-room.ts`.
- The client sent keyboard state at a fixed interval.
- The server applied WASD movement relative to aim angle, clamped players to arena bounds, resolved simple obstacle collisions, applied jump/gravity, and regenerated mana.

## Camera Code

- Camera logic lived in `apps/client/src/camera.ts`.
- It used a third-person shoulder camera with yaw/pitch smoothing, mouse delta input, and a forward aim ray.
- The new project keeps the idea of a readable third-person camera but rewrites it for a lighter Colyseus client.

## Voice Detection

- Voice logic lived in `apps/client/src/voice.ts`.
- It used `SpeechRecognition` / `webkitSpeechRecognition`, continuous recognition, interim feedback, exact and fuzzy matching.
- Prototype incantations were `EMBER`, `FROST`, `WARD`, `BLINK`, and `FOCUS`.
- The new jam spellbook uses the spec incantations: `ignis`, `gelu`, `lux`, and `umbra`.

## Spell Code

- Client VFX lived in `effects.ts` and `projectile.ts`.
- Server spell authority lived in `duel-room.ts`.
- Prototype spells included projectile casts, shield, blink, focus, mana costs, cooldowns, projectile collision, shield absorption, slow effects, and HP damage.
- The new project preserves the authoritative-server pattern and rewrites spells as `fireball`, `ice_bolt`, `light_burst`, and `shadow_dash`.

## Player Placeholder Logic

- `apps/client/src/player.ts` created capsule mage placeholders, a simple hat, and a shield sphere.
- It attempted to load optional GLB characters but gracefully stayed on primitives if assets were missing.
- The new project intentionally uses primitive mesh mages only, avoiding GLB/FBX assets for a fast first load.

## Assets

- The prototype referenced optional GLB paths under `apps/client/public/models`.
- The snapshot also contains very large FBX animation/model assets under `ASSETS/3d-models`, roughly 22-25 MB per file.
- These assets are not included in the new client and should not be deployed for the VibeJam lightweight build.

## Server And Networking

- The prototype used a custom raw WebSocket protocol rather than Colyseus.
- Room management, quick match, reconnection, match rounds, snapshots, and validation were implemented manually.
- The new project replaces this with Colyseus room state and messages while keeping server authority over movement, mana, cooldowns, projectiles, damage, and phase transitions.

## What Carries Forward

- Small 1v1 duel scope.
- Third-person readable camera.
- Server-confirmed casts and damage.
- Keyboard fallback for voice casting.
- Procedural lightweight arena.
- Debug/HUD overlay over a Three.js canvas.

## What Does Not Carry Forward

- Raw `ws` networking.
- Login, account, or profile progression.
- Heavy FBX assets.
- Optional GLB loading pipeline.
- Menus that block instant entry.
- SuperSplat or Gaussian splat content.
