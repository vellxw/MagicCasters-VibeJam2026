import { describe, expect, it } from 'vitest';
import {
  mergeSplatArenaPresetForRuntime,
  type SplatArenaPreset
} from '../../../client/src/world/ArenaPreset';

function makePreset(overrides: Partial<SplatArenaPreset> = {}): SplatArenaPreset {
  return {
    presetId: 'businesspark-belp-1og-ost',
    presetVersion: 2,
    arenaId: 'splat-test',
    displayName: 'Businesspark Belp 1OG Ost',
    type: 'splat',
    splatUrl: '/splats/businesspark-belp-1og-ost.sog',
    collisionMeshUrl: '/collision/businesspark-belp-1og-ost.collision.glb',
    voxelCollisionUrl: '/collision/businesspark-belp-1og-ost.voxel.json',
    enabledModes: ['1v1'],
    spawnPoints: [
      { x: -3.8, y: 0, z: 0.9, rotY: -1.4 },
      { x: 6.1, y: 0, z: -0.9, rotY: 1.8 }
    ],
    spawnPointsByMode: {
      '1v1': [
        { x: -3.8, y: 0, z: 0.9, rotY: -1.4 },
        { x: 6.1, y: 0, z: -0.9, rotY: 1.8 }
      ],
      '2v2': [
        { x: -3.8, y: 0, z: 0.9, rotY: -1.4 },
        { x: 6.1, y: 0, z: -0.9, rotY: 1.8 },
        { x: -3.8, y: 0, z: 2.2, rotY: -1.4 },
        { x: 6.1, y: 0, z: -2.2, rotY: 1.8 }
      ]
    },
    bounds: { minX: -8, maxX: 11.1, minZ: -12, maxZ: 9.8 },
    scale: 1,
    rotation: { x: 180, y: 180, z: 0 },
    offset: { x: 0, y: 0, z: 0 },
    floorY: 0,
    collisionErasers: [],
    collisionWalls: [
      { id: 'ladder-a', x: -0.2, z: -6.5, width: 0.6, depth: 0.8, height: 1.5, rotY: 14.3, climbable: true }
    ],
    ...overrides
  };
}

describe('splat preset runtime merge', () => {
  it('ignores stale browser autosaves when the static preset version changed', () => {
    const base = makePreset();
    const staleSaved = makePreset({
      presetVersion: undefined,
      bounds: { minX: -8, maxX: 8, minZ: -6, maxZ: 6 },
      rotation: { x: 180, y: 0, z: 0 },
      spawnPoints: [
        { x: -5.5, y: 0, z: 0, rotY: -Math.PI / 2 },
        { x: 5.5, y: 0, z: 0, rotY: Math.PI / 2 }
      ],
      collisionWalls: []
    });

    expect(mergeSplatArenaPresetForRuntime(base, staleSaved)).toMatchObject({
      presetVersion: 2,
      bounds: { minX: -8, maxX: 11.1, minZ: -12, maxZ: 9.8 },
      rotation: { x: 180, y: 180, z: 0 },
      spawnPoints: [
        { x: -3.8, y: 0, z: 0.9, rotY: -1.4 },
        { x: 6.1, y: 0, z: -0.9, rotY: 1.8 }
      ],
      collisionWalls: [
        { id: 'ladder-a' }
      ],
      voxelCollisionUrl: '/collision/businesspark-belp-1og-ost.voxel.json'
    });
  });
});
