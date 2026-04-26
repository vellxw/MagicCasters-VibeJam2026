# Codex Execution Tasks

## Important Behavior

Work autonomously.
Do not ask for confirmation unless there is a real blocking issue.
Do not modify the old prototype folder.
Do not use Git.
Do not create Git commits.
Do not integrate SuperSplat yet.

Old prototype path:

`C:\Users\franc\OneDrive\Escritorio\VibeJam`

## Phase 1 — Safety Snapshot

1. Create `_legacy_snapshot`.
2. Copy the old prototype into `_legacy_snapshot/original-prototype-copy`.
3. Exclude:
   - node_modules
   - dist
   - build
   - .vite
   - .cache
   - coverage
   - .git
   - logs
   - temporary/generated files
4. Do not edit the original old prototype.

## Phase 2 — Inspection

Inspect the old prototype and document:

- framework/build tool
- package manager
- entry point
- movement code
- camera code
- voice detection
- spell code
- player placeholder logic
- assets
- scripts

Write this to:

`docs/migration-from-old-prototype.md`

## Phase 3 — Build New AI-Written Game

Create a new clean project in this repo.

Use the old prototype as reference, but generate new code where possible to satisfy the 90% AI-written rule.

Create:

- client
- server
- shared
- docs

## Phase 4 — Client

Implement a lightweight Three.js arena:

- instant start
- no loading screen
- simple arena floor
- two mage placeholders
- camera
- movement
- spell VFX
- voice commands
- keyboard fallback
- debug overlay
- VibeJam widget in HTML

## Phase 5 — Server

Implement Colyseus:

- MagicDuelRoom
- 1v1 max
- GameState
- PlayerState
- ProjectileState
- movement updates
- cast validation
- projectile updates
- damage
- phase management

## Phase 6 — Integration

Make two browser tabs work:

- both join the same room
- each sees the other player
- movement syncs
- casts are server-confirmed
- HP/mana syncs
- debug overlay displays useful state

## Phase 7 — Documentation

Create:

- README.md
- docs/multiplayer.md
- docs/voice-casting.md
- docs/jam-compliance.md
- docs/future-gaussian-splat-arena.md

## Acceptance Criteria

- New project runs from this repo.
- Original old prototype untouched.
- Snapshot exists.
- Client runs.
- Server runs.
- Two tabs can play 1v1.
- No login/signup.
- Free-to-play.
- VibeJam widget is present.
- No loading screen.
- Lightweight first load.
- Voice casting works if browser supports it.
- Keyboard fallback works.
- Spell confirmation comes from server.
- Docs explain compliance.
