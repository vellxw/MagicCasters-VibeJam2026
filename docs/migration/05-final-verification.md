# Phase 5: Final Verification

Goal: confirm the migrated project works end-to-end.

## Commands

```bash
npm install
npm run typecheck
npm run test --workspace server
npm run build
```

## Manual Smoke Test

- [ ] Start `npm run dev`.
- [ ] Open client.
- [ ] Lobby loads.
- [ ] Portal opens character selector.
- [ ] Character model preview works.
- [ ] Confirm enters queue.
- [ ] Colyseus room starts.
- [ ] Match loads the selected/current map.
- [ ] Player can move.
- [ ] Spells work.
- [ ] VFX failures do not crash gameplay.
- [ ] Calibration still supports `low` / `mid` / `high` maps.
- [ ] Voxel collision still works.

## Definition Of Done

- Multiplayer server runs.
- Current map quality system is preserved.
- Current voxel collision system is preserved.
- Characters are integrated.
- Selector does not freeze match load.
- VFX is integrated with fallback behavior.
