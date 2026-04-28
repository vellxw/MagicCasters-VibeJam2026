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

For local Vite development, the client defaults to `ws://localhost:3001`. In production, when the built client is served by the Colyseus server, the client defaults to the same origin (`wss://your-domain` on HTTPS), so Render does not need `VITE_COLYSEUS_URL`.

## Render Deployment

Use a Render Web Service connected to the repo branch.

Build Command:

```bash
npm install && npm run build
```

Start Command:

```bash
npm run start
```

The root `start` script runs the compiled Colyseus server. The server reads `process.env.PORT`, serves `client/dist` over HTTP, and hosts Colyseus WebSockets on the same Render URL.

The client uses same-origin WebSockets in production, so both the built client and the `magic_match` Colyseus room run from the same Render URL. Render can keep:

- Build Command: `npm install && npm run build`
- Start Command: `npm run start`

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
