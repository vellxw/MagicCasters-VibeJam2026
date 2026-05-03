# VibeJam Magic Duel

A lightweight AI-generated browser magic duel for VibeJam 2026.

The game uses Three.js for a tiny local 3D lobby plus primitive arena, and Colyseus for authoritative public matchmaking. There is no login, no signup, no loading screen, and no heavy asset pipeline. Players enter a local lobby, choose either the `1v1 Duel` or `2v2 Team Duel` portal, then join the first available `magic_match` room for that mode.

## Requirements

- Node.js 20+
- npm
- Chrome or Edge for voice casting support

## Run Locally

```bash
npm install
npm run dev
```

Client: `http://localhost:5173`  
Server: `ws://localhost:3001`

Run in two terminals if you prefer separate processes:

```bash
npm run dev:server
npm run dev:client
```

## Checks

```bash
npm run test --workspace server
npm run typecheck
npm run build
npm run start
```

## Controls

- Move: `WASD` or arrow keys
- Aim camera: click the canvas, then move the mouse
- Queue: walk near a lobby portal and press `E`
- Cancel queue / leave results: `Esc`
- Cast by keyboard: `1` fireball, `2` ice bolt, `3` light burst, `4` shadow dash
- Cast by voice: click `Voice`, then say `ignis`, `gelu`, `lux`, or `umbra`

Voice casting uses browser `SpeechRecognition` / `webkitSpeechRecognition` when available. Keyboard casting is always available.

## Environment

```bash
PORT=3001
SERVER_PORT=3001
VITE_COLYSEUS_URL=ws://localhost:3001
```

For local Vite development, the client defaults to `ws://localhost:3001`. In production, when the built client is served by the Colyseus server, the client defaults to the same origin (`wss://your-domain` on HTTPS), so Fly.io does not need `VITE_COLYSEUS_URL`.

## Fly.io Deployment

Use the Dockerized Fly.io app config in the repo root.

For public playtests, keep one Machine running in `iad` (Ashburn, Virginia / US East). The default `fly.toml` disables autostop so players do not hit cold starts.

First setup:

```bash
fly auth login
fly apps create vibejam-magic-duel
fly deploy
```

After the app exists, deploy updates with:

```bash
fly deploy
```

Fly app names are globally unique. If `vibejam-magic-duel` is taken, create a different app name and update the `app` field in `fly.toml`.

The root `start` script runs the compiled Colyseus server. The Docker image sets `PORT=8080`; the server reads `process.env.PORT`, serves `client/dist` over HTTP, and hosts Colyseus WebSockets on the same Fly URL.

The client uses same-origin WebSockets in production, so both the built client and the `magic_match` Colyseus room run from the same Fly URL. See `docs/fly-production.md` before changing Fly environment variables; production should normally leave `VITE_COLYSEUS_URL` unset so the client connects with `wss://` on the current Fly origin.

## Cloudflare Static Deployment

Use Cloudflare for the public frontend when you want Render/Fly to handle only Colyseus traffic.

In Workers & Pages, use:

```bash
Build command: npm install && npm run build:cloudflare
Deploy command: npx wrangler deploy
```

The root `wrangler.jsonc` deploys `client/dist` as Workers Static Assets and enables SPA fallback. The Cloudflare build removes optional collision GLB files that exceed the 25 MiB Workers asset limit; source assets remain under `client/public`. Set `VITE_COLYSEUS_URL` to the live Colyseus server, for example `wss://your-game-server.onrender.com`. For R2 asset hosting later, set `VITE_ASSET_BASE_URL` to the public R2/custom-domain origin and upload `splats/`, `collision/`, `map-previews/`, and `models/` with the same paths.

## Project Layout

```txt
client/   Vite + TypeScript + Three.js browser game
server/   Node + TypeScript + Colyseus authoritative room
shared/   spell ids, constants, and shared network types
docs/     migration notes, multiplayer, voice, compliance, final report
```

## VibeJam Notes

- Required widget is included in `client/index.html`.
- The old prototype is copied under `_legacy_snapshot/original-prototype-copy` for read-only reference.
- No old prototype code was integrated wholesale.
- The lightweight arena remains the default. A lazy, optional SuperSplat spike is documented in `docs/supersplat-arena.md` and exposed only through the experimental `Realistic Arena Test` portal.
