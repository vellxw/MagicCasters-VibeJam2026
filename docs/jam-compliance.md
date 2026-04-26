# VibeJam Compliance

## Required Widget

`client/index.html` includes:

```html
<script async src="https://vibej.am/2026/widget.js"></script>
```

## Access

- No login
- No signup
- Free to play
- Opens directly into the arena
- No loading screen

## Lightweight Build

- No FBX, GLB, texture, audio, or Gaussian Splat assets are loaded.
- The arena and mages are generated from Three.js primitives.
- The production bundle is JavaScript/CSS only.

## Multiplayer

- Colyseus room: `magic_duel`
- Max clients: 2
- Server validates spells, mana, cooldowns, projectile hits, damage, and dash clamping.

## Old Prototype Use

- The old prototype was copied into `_legacy_snapshot/original-prototype-copy`.
- The original prototype path was not modified.
- The old prototype was used only for reference notes documented in `docs/migration-from-old-prototype.md`.
- The new implementation is generated in this repository.

## SuperSplat

SuperSplat / Gaussian Splat content is intentionally deferred and is not integrated in this build.
