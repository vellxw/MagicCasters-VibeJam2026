# Phase 4: VFX System

Goal: migrate advanced VFX while keeping gameplay resilient if VFX files fail to load.

## Inputs From Old Repo

- `client/public/vfx/**`
- `client/src/vfx/**`
- optionally `client/src/vfx-editor/**`
- optionally `client/vfx-editor.html`
- old `client/src/spells/SpellVfxManager.ts`

## Integration Rules

- Gameplay must not depend on VFX loading success.
- Missing VFX definitions must not crash the match.
- Keep a simple fallback burst/projectile effect for any missing VFX.
- Support current spells, including `shadow_dash` if present.
- Do not change spell balance in this phase.

## Steps

- [ ] Copy VFX JSON assets.
- [ ] Copy VFX runtime files.
- [ ] Replace/adapt `SpellVfxManager.ts` to use runtime first and fallback second.
- [ ] Add missing VFX fallback for any spell without JSON definitions.
- [ ] Optionally copy VFX editor and configure Vite only after gameplay VFX is stable.
- [ ] Verify projectiles, impacts, and casts do not crash if a JSON file is missing.
