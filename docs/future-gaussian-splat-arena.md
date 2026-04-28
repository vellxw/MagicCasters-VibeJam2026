# Future Gaussian Splat Arena

SuperSplat remains intentionally outside the default VibeJam path. The repository now includes a safe optional spike under `docs/supersplat-arena.md` and `client/public/arena-presets/splat-test.json`, but the lightweight arena is still the default arena.

## Why It Is Deferred

- The current jam target needs fast first interaction.
- Gaussian splats can add large downloads.
- The default arena works with procedural primitives and avoids an asset pipeline.
- VibeJam rules prioritize no loading screens and lightweight delivery.

## Future Direction

If splats graduate beyond the spike, keep them optional:

- ship a primitive arena as the default fallback
- lazy-load splats only after gameplay is already interactive
- keep splat files compressed and budgeted
- preserve the same Colyseus gameplay state
- avoid changing the server authority model

## Integration Boundary

Splat work should live in render-only modules such as:

```txt
client/src/world/ArenaProvider.ts
client/src/world/PlayCanvasSplatLayer.ts
```

It should not own spell logic, player state, cooldowns, HP, or networking.
