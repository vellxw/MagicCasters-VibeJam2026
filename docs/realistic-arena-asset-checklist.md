# Realistic Arena Asset Checklist

## Current Assets

The previous `Dorfplatz Interlaken Switzerland.sog` test map was removed from `client/public/splats/`.

Current maps copied from `C:\Users\franc\OneDrive\Escritorio\mapas`:

- `client/public/splats/businesspark-belp-1og-ost.sog`
  - Source: `Businesspark Belp 1OG Ost.sog`
  - Runtime URL: `/splats/businesspark-belp-1og-ost.sog`
  - Size: 14,381,152 bytes, about 13.72 MiB
  - Metadata: `splat-transform v1.10.2`, 1,239,824 splats
- `client/public/splats/moscow-novoslobodskaya-dollhouse.sog`
  - Source: `Moscow. Novoslobodskaya (Russian Новослобо́дская) is a Moscow Metro station (dollhouse).sog`
  - Runtime URL: `/splats/moscow-novoslobodskaya-dollhouse.sog`
  - Size: 7,143,460 bytes, about 6.81 MiB
  - Metadata: `splat-transform v1.10.2`, 578,705 splats

The source files in `C:\Users\franc\OneDrive\Escritorio\mapas` were not deleted.

## Catalog And Presets

Map catalog:

```txt
client/public/arena-presets/splat-catalog.json
```

Preset files:

```txt
client/public/arena-presets/businesspark-belp-1og-ost.json
client/public/arena-presets/moscow-novoslobodskaya-dollhouse.json
```

`client/public/arena-presets/splat-test.json` remains as a compatibility alias for the default Businesspark map.

Important preset fields:

```json
{
  "presetId": "businesspark-belp-1og-ost",
  "arenaId": "splat-test",
  "displayName": "Businesspark Belp 1OG Ost",
  "type": "splat",
  "splatUrl": "/splats/businesspark-belp-1og-ost.sog",
  "splatFileSizeBytes": 14381152,
  "collisionMeshUrl": null,
  "scale": 1,
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "offset": { "x": 0, "y": 0, "z": 0 },
  "floorY": 0,
  "bounds": { "minX": -8, "maxX": 8, "minZ": -6, "maxZ": 6 }
}
```

## In-Game Configuration

Open calibration mode:

```txt
http://127.0.0.1:<port>/?calibrateSplat=1
```

Or press `F8` from the lobby.

Calibration mode now has a map selector. Use it to switch between the imported SOG maps, tune `scale`, `rotation`, `offset`, `floorY`, `bounds`, spawn points, and invisible `collisionWalls`, then press `Save Config`. Wall `height` is gameplay height: low boxes can be jumped over or landed on, taller walls block, and `Toggle Ladder` keeps ladder/climb behavior separate.

Saved configs are stored inside the game runtime for that browser using `localStorage`:

```txt
magic-casters:active-splat-preset
magic-casters:splat-preset:<presetId>
```

The Realistic Arena Test portal uses the saved active map on that browser. Use `Copy Preset JSON` when you want to promote a tuned browser config back into the repo preset file.

## Collision

Current gameplay collision mode: editable preset walls plus fallback bounds/floor.

If there is no generated collision GLB yet, presets use:

```json
"collisionMeshUrl": null
```

To generate a guide GLB from a SOG:

```bash
npm run splat:collision -- --input client/public/splats/<arena>.sog --arena <arena>
```

This writes voxel data and:

```txt
client/public/collision/<arena>.collision.glb
```

Then point the preset to:

```json
"collisionMeshUrl": "/collision/<arena>.collision.glb"
```

In calibration, enable `Show Generated Collision` to display that GLB as a translucent guide, then retouch editable invisible walls, ladders, and eraser zones by hand.

The GLB should be low-detail and should represent playable surfaces, blockers, and bounds. It is not authoritative gameplay collision; server movement uses the published preset's voxel collision, manual `collisionWalls`, ladders, erasers, floor, and bounds.

## Fallback

If the SOG catalog, preset, SOG file, PlayCanvas layer, or collision mesh fails:

- gameplay continues,
- the lightweight arena remains visible,
- the debug overlay reports the splat state,
- collision uses fallback floor/bounds plus published editable `collisionWalls`,
- 1v1 and 2v2 keep working; modes without a compatible published map fall back to the lightweight arena.

## Local Test

```bash
npm run typecheck
npm run build
npm run start
```

Open the local URL, enter `1v1 Duel`, `2v2 Team Duel`, `Realistic Arena Test`, or use `?calibrateSplat=1`. The SOG request should happen only after a splat-backed match or calibration flow is selected.

## Render Test

Deploy with the existing Render commands. After deploy:

- verify the lobby loads,
- verify the VibeJam widget remains,
- verify 1v1 and 2v2 still start,
- verify splat-backed matches request one of the files under `/splats/`,
- verify fallback gameplay continues if the SOG load fails.
