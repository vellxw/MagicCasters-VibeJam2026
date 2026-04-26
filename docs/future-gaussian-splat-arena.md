# Future Gaussian Splat Arena

SuperSplat is intentionally not part of the VibeJam build in this repository.

## Why It Is Deferred

- The current jam target needs fast first interaction.
- Gaussian splats can add large downloads.
- The current arena works with procedural primitives and avoids an asset pipeline.
- VibeJam rules prioritize no loading screens and lightweight delivery.

## Future Direction

If splats are added later, keep them optional:

- ship a primitive arena as the default fallback
- lazy-load splats only after gameplay is already interactive
- keep splat files compressed and budgeted
- preserve the same Colyseus gameplay state
- avoid changing the server authority model

## Integration Boundary

Future splat work should live in a render-only module, likely under:

```txt
client/src/world/SplatArena.ts
```

It should not own spell logic, player state, cooldowns, HP, or networking.
