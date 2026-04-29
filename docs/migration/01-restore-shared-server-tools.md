# Phase 1: Restore Shared, Server, Tools

Goal: recover the missing multiplayer/project base while preserving this repo's newer map and collision APIs.

## Why This Phase Exists

The current repo has client code using Colyseus via `colyseus.js`, but it is missing the server implementation. The root `package.json` still declares a `server` workspace and scripts like `dev:server`, so the project is structurally incomplete without `server/`.

The current repo also imports `../../../shared/...` from many client files, but `shared/` is missing. This must be restored before TypeScript can compile.

The root scripts reference `tools/generate-splat-collision.mjs` and `tools/generate-splat-qualities.mjs`; `tools/` is missing.

## Inputs From Old Repo

- `shared/`
- `server/`
- `tools/generate-splat-collision.mjs`

## Target-Specific Requirements

- `shared/splatMapPool.ts` must support `SplatQuality`, `normalizeSplatQuality`, and `resolveSplatQualityEntry` because current `ArenaPreset.ts` imports them.
- `shared/spells.ts` must preserve current spells, including `shadow_dash` if present in this repo.
- Server must understand the current `splat-catalog.json` format with `qualities`.
- Server must keep Colyseus room behavior from the old repo.
- Collision generation must keep this repo's current low-SOG/filtered/voxel approach.

## Steps

- [x] Inspect current imports from `shared/` and list required exported symbols.
- [x] Copy old `shared/` as a starting point only if the target folder is missing.
- [x] Patch `shared/splatMapPool.ts` to support current map quality metadata.
- [x] Patch `shared/spells.ts` to include current spell set and old class spell variants where compatible.
- [x] Copy old `server/` as the Colyseus baseline because target `server/` is missing.
- [x] Patch server map selection to choose a quality entry from the current catalog format.
- [x] Copy `tools/generate-splat-collision.mjs` if missing.
- [x] Add or recreate `tools/generate-splat-qualities.mjs` only if the root script requires it and it is absent.
- [x] Run `npm run typecheck` and record errors before moving to phase 2.

## Phase 1 Result

- Restored missing `shared/`, `server/`, and `tools/` base.
- Added `SplatQuality` support to `shared/splatMapPool.ts` for the current catalog format.
- Added `shadow_dash` compatibility to shared spell/types and server cooldown fields.
- Added a server test for `shadow_dash` and made cast-based dash move the caster instead of consuming resources as a no-op.
- Added `tools/generate-splat-qualities.mjs` as a safe catalog validator for existing `low` / `mid` / `high` assets.
- Repaired a locally corrupt `node_modules/picomatch` package by reinstalling that package through npm.

Verification completed:

```bash
npm run typecheck
npm run test --workspace server
npm run splat:qualities
npm run build
```

Notes:

- Server tests passed with 47 tests.
- Production build passed with Vite's existing chunk-size warning.

## Verification

- `npm run typecheck`
- `npm run test --workspace server` if server dependencies are present

## Do Not Do In This Phase

- Do not copy character models.
- Do not add selector UI.
- Do not replace current arena presets or splat files.
- Do not change render scale or graphics quality behavior.
