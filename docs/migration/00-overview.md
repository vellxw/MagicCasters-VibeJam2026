# Migration Overview

Goal: bring useful work from `C:\Users\usuario\Desktop\GameJam Proyect` into this repo without breaking the current map and collision work.

Source repo: `C:\Users\usuario\Desktop\GameJam Proyect`

Target repo: `C:\Users\usuario\Desktop\GameJam Proyect new`

## Principles

- Do not overwrite whole folders unless the target folder is missing or intentionally empty.
- Keep this repo's `low` / `mid` / `high` splat map system.
- Keep this repo's voxel collision flow and generated collision assets.
- Use the old repo as a source for missing multiplayer server code, character models, selector UI, and advanced VFX.
- Verify after each phase before moving to the next phase.
- Prefer small, reversible changes.

## Phase Order

1. Restore/fuse `shared`, `server`, and `tools` enough for Colyseus multiplayer and scripts to exist.
2. Preserve current maps and collision behavior; do not regress them.
3. Bring character models and selector flow without replacing `GameApp.ts` wholesale.
4. Bring advanced VFX with fallbacks so missing VFX definitions cannot crash gameplay.
5. Run final typecheck, tests, build, and manual smoke test.

## Things To Never Copy Blindly

- `node_modules/`
- `client/dist/`
- `server/dist/`
- `.git/`
- logs or screenshots
- old `client/public/arena-presets/splat-catalog.json` over the current catalog
- old graphics settings that force low render scale
