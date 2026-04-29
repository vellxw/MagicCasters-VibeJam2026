# Phase 4: VFX System

## Status: Completed

## What Was Migrated

### Assets (`client/public/vfx/`)
Copied all JSON VFX definitions from the old repo:
- `index.json` – catalog of all definitions
- `fireball_cast.json`, `fireball_impact.json`, `fireball_projectile.json`
- `ice_bolt_projectile.json`, `ice_bolt_impact.json`
- `light_burst_cast.json`, `light_burst_impact.json`
- `portal_spin.json`

Note: `ice_bolt_cast.json` is listed in the old index but does not exist on disk. The loader now skips missing/invalid definitions gracefully.

### Runtime (`client/src/vfx/`)
New modules created:
- `types.ts` – VFX type definitions (Mesh, Light, Particles, Trail layers)
- `VfxLibrary.ts` – in-memory registry
- `VfxLoader.ts` – fetch + validate JSON, resilient to missing files
- `VfxRuntime.ts` – orchestrates instances, update loop, attach points
- `emitters/BaseEmitter.ts` – abstract emitter
- `emitters/MeshEmitter.ts` – animated geometry
- `emitters/LightEmitter.ts` – point/spot lights
- `emitters/ParticleEmitter.ts` – particle emission
- `emitters/ParticleSystem.ts` – particle pool with **camera billboard** fix
- `emitters/TrailEmitter.ts` – trail proxy (uses mesh instead of Line to avoid ignored linewidth)

### SpellVfxManager (`client/src/spells/SpellVfxManager.ts`)
Rewritten with **hybrid fallback** strategy:
- Tries JSON-driven VFX first (`runtime.play`)
- Falls back to simple spheres/rings/bursts if definition missing or runtime not ready
- `preload()` loads all definitions from `/vfx/index.json` on match start (fire-and-forget)
- `reset()` cleans up VFX instances and fallback meshes when leaving a match
- `setPlayerAttachPoint()` / `playAtAttachPoint()` support cast effects at hand/head

### GameApp Integration (`client/src/game/GameApp.ts`)
- `setupVfxAttachPoints()` creates proxy groups (head, handR, handL) as children of player controllers
- Called automatically when a player controller is created in `ensurePlayerController()`
- `enterMatch()` calls `this.vfx.preload()`
- `clearMatchScene()` calls `this.vfx.reset()`
- `handleNetEvent('spell_confirmed')` now also triggers `playCastVfx()` at `caster_hand_right`

## Fixes Applied vs Old Repo
- `ParticleSystem` now orients particles to face the camera (`mesh.lookAt(camera.position)`)
- `TrailEmitter` uses a mesh proxy instead of `Line` (WebGL ignores `linewidth > 1`)
- `VfxLoader.loadAllFromIndex()` skips failed definitions instead of crashing
- `VfxRuntime.createEmitters()` logs a warning for unknown layer types instead of throwing

## Tests
- `client/src/spells/SpellVfxManager.test.ts` (5 tests, all passing)
  - fallback projectile when runtime is null
  - fallback burst on confirmSpell
  - reset cleans everything
  - attach points registration
  - update does not crash with empty state

## Verification
- `npm run typecheck` ✅
- `npm run test --workspace client` ✅ (12 passed)
- `npm run test --workspace server` ✅ (53 passed)
- `npm run build` ✅

## Next Steps (Phase 5)
End-to-end manual verification:
- Cast each spell and confirm VFX appears at hand + impact
- Verify fallback visuals show when JSON is missing
- Confirm no freeze or crash when entering/leaving matches repeatedly
