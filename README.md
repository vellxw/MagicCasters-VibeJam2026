# VibeJam Magic Duel

A lightweight AI-generated 1v1 browser magic duel for VibeJam 2026.

The game uses Three.js for a primitive 3D arena and Colyseus for authoritative 1v1 multiplayer. There is no login, no signup, no loading screen, and no heavy asset pipeline. Players automatically join the `magic_duel` room; open a second tab to start a duel.

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
```

## Controls

- Move: `WASD` or arrow keys
- Aim camera: click the canvas, then move the mouse
- Cast by keyboard: `1` fireball, `2` ice bolt, `3` light burst, `4` shadow dash
- Cast by voice: click `Voice`, then say `ignis`, `gelu`, `lux`, or `umbra`

Voice casting uses browser `SpeechRecognition` / `webkitSpeechRecognition` when available. Keyboard casting is always available.

## Environment

```bash
SERVER_PORT=3001
VITE_COLYSEUS_URL=ws://localhost:3001
```

For deployment, set `VITE_COLYSEUS_URL` to the public WebSocket URL for the Colyseus server.

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
- SuperSplat / Gaussian Splat is intentionally not part of this jam build.
