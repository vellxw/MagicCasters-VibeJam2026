# Phase 2: Preserve Current Maps And Collision

Goal: protect the newer map quality and voxel collision work while integrating server/shared code.

## Keep From Current Repo

- `client/public/arena-presets/splat-catalog.json`
- `client/public/arena-presets/*-low.json`
- `client/public/arena-presets/*-mid.json`
- `client/public/arena-presets/*-high.json`
- `client/public/splats/*-low.sog`
- `client/public/splats/*-mid.sog`
- `client/public/splats/*-high.sog`
- `client/public/collision/*.voxel.json`
- `client/public/collision/*.voxel.bin`
- `client/public/collision/*.collision.glb`
- `client/src/world/AutoCollisionGenerator.ts`
- `client/src/world/VoxelCollisionLoader.ts`
- `client/src/world/ArenaProvider.ts`
- `client/src/world/PlayCanvasSplatLayer.ts`

## Known Good Current Collision Behavior

Current collision generation uses a less fragile voxel workflow:

```text
--large
--voxel-size 0.3
--opacity 0.35
--decimate 1%
--carve none
--no-external-fill
--no-floor-fill
--filter-box
```

The generator chooses the `-low.sog` variant for grouped maps. Preserve this.

## Steps

- [x] Ensure server-side map selection can read the current catalog `qualities` object.
- [x] Ensure server uses a published preset URL that points to an actual current preset JSON.
- [x] Ensure existing voxel collision URLs still load client-side.
- [x] Ensure server-side voxel collision loader accepts current `/collision/*.voxel.json` assets.
- [x] Verify calibration still displays map and quality selectors.

## Do Not Do

- Do not replace the current catalog with the old single-quality catalog.
- Do not replace current collision assets with old generated assets.
- Do not copy old graphics settings that lower render resolution.

## Phase 2 Result

- Added a server test proving grouped `qualities` catalog entries resolve through their `defaultQuality` preset URL.
- Updated server map selection to resolve `SplatMapQualityEntry` before loading a preset.
- Kept the current catalog and all current `.sog` / voxel collision assets intact.
- Extended `npm run splat:qualities` to validate quality preset/splat files and referenced collision files.
- Confirmed the built server can load all current voxel collision assets from `client/public/collision`.

Verification completed:

```bash
npm run splat:qualities
npm run typecheck
npm run test --workspace server
npm run build
```

Additional runtime check:

```bash
node --input-type=module -e "import { loadServerVoxelCollisionSync } from './server/dist/server/src/systems/ServerVoxelCollision.js'; const urls=['/collision/celestial-marble-crystal-palace.voxel.json','/collision/atrium-godiva-10m-sh3-spirulae-splat.voxel.json','/collision/dorfplatz-interlaken-switzerland.voxel.json','/collision/maison-provence.voxel.json','/collision/smart-room-colmap-lfs.voxel.json','/collision/businesspark-belp-1og-ost.voxel.json']; const missing=urls.filter((url)=>!loadServerVoxelCollisionSync(url, process.cwd())); if (missing.length) { console.error('Voxel load failed:', missing.join(', ')); process.exit(1); } console.log('Server voxel load OK:', urls.length);"
```

Notes:

- Current catalog map groups still have `enabledModes: []`; that means the server will not publish those maps into matchmaking until calibration/publish enables a mode. This preserves current data instead of forcing maps into matchmaking.
- Build passed with Vite's existing chunk-size warning.
