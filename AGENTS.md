# Agent Notes

This file contains agent-focused guidance for working with the VibeJam Magic Duel project.

## Project Overview

- **Name:** VibeJam Magic Duel
- **Type:** Browser-based 3D magic duel game
- **Stack:** Vite + TypeScript + Three.js (client), Node + TypeScript + Colyseus (server)
- **Monorepo:** client/, server/, shared/, docs/

## Quick Commands

```bash
# Install dependencies
npm install

# Run both client and server
npm run dev

# Run separately
npm run dev:client
npm run dev:server

# Checks
npm run test --workspace server
npm run typecheck
npm run build
npm run start
```

## Environment Variables

```bash
PORT=3001
SERVER_PORT=3001
VITE_COLYSEUS_URL=ws://localhost:3001
```

## Key Architecture Notes

- Client: `http://localhost:5173`
- Server: `ws://localhost:3001`
- No login/signup; players queue via lobby portals
- Voice casting uses browser SpeechRecognition (`ignis`, `gelu`, `lux`, `umbra`)
- Keyboard casting always available (`1`-`4`)
- Render deployment: build `npm install && npm run build`, start `npm run start`

## Installed Skills

The following agent skills are installed globally and available for this project:

- **brainstorming** (`obra/superpowers@brainstorming`) – Structured brainstorming and idea generation workflows.
- **using-superpowers** (`obra/superpowers@using-superpowers`) – Meta-skill for discovering and applying other skills effectively.
- **systematic-debugging** (`obra/superpowers@systematic-debugging`) – Methodical debugging approach with step-by-step investigation.
- **writing-plans** (`obra/superpowers@writing-plans`) – Planning and task decomposition before implementation.
- **test-driven-development** (`obra/superpowers@test-driven-development`) – TDD workflows and red-green-refresh cycles.
- **requesting-code-review** (`obra/superpowers@requesting-code-review`) – Preparing and requesting structured code reviews.

All skills live in `~\.agents\skills\` and run with full agent permissions. Use them proactively when the relevant task arises.

## Code Style

- TypeScript strict mode enabled
- Prefer explicit types over `any`
- Use shared constants and network types from `shared/`
- Keep client and server logic cleanly separated

## Important Files

- `client/index.html` – Required VibeJam widget included here
- `shared/` – Spell IDs, constants, and shared network types
- `docs/` – Migration notes, multiplayer design, voice casting, compliance, final report
- `_legacy_snapshot/original-prototype-copy` – Read-only legacy reference

## Deployment

- Build command: `npm install && npm run build`
- Start command: `npm run start`
- In production, the Colyseus server serves `client/dist` and hosts WebSockets on the same origin
