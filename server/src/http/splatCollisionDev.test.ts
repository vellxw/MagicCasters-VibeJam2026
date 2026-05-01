import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getSplatCollisionDevStatus,
  isDevPostRequestAuthorized,
  isLocalDevSplatCollisionRequestAllowed,
  normalizeSplatCollisionDevRequest,
  persistArenaPresetToProject,
  persistCollisionUrlsToPresetFiles
} from './splatCollisionDev';

describe('splat collision dev api helpers', () => {
  it('allows only local non-production requests', () => {
    expect(isLocalDevSplatCollisionRequestAllowed({ NODE_ENV: 'development' }, '127.0.0.1:3001', '::1')).toBe(true);
    expect(isLocalDevSplatCollisionRequestAllowed({ NODE_ENV: 'production' }, '127.0.0.1:3001', '::1')).toBe(false);
    expect(isLocalDevSplatCollisionRequestAllowed({ NODE_ENV: 'development' }, 'game.example.com', '203.0.113.1')).toBe(false);
  });

  it('normalizes splat collision requests to safe local filenames', () => {
    const request = normalizeSplatCollisionDevRequest({
      arenaId: '../Business Park!',
      splatUrl: '/splats/businesspark-belp-1og-ost.sog'
    });

    expect(request).toEqual({
      arenaId: 'Business-Park',
      splatFilename: 'businesspark-belp-1og-ost.sog',
      collisionMeshUrl: '/collision/Business-Park.collision.glb',
      voxelCollisionUrl: '/collision/Business-Park.voxel.json',
      playableFilterBox: null
    });
  });

  it('normalizes playable filter boxes for bounded auto collision', () => {
    const request = normalizeSplatCollisionDevRequest({
      arenaId: 'maison-provence',
      splatUrl: '/splats/Maison%20Provence.sog',
      playableFilterBox: '-9.2501,-0.75,-7.25,9.25,5,7.25'
    });

    expect(request.playableFilterBox).toBe('-9.25,-0.75,-7.25,9.25,5,7.25');
  });

  it('rejects non-splat public paths', () => {
    expect(() => normalizeSplatCollisionDevRequest({
      arenaId: 'bad',
      splatUrl: '/collision/bad.collision.glb'
    })).toThrow(/splatUrl/);
  });

  it('reports a local dev status payload for browser diagnostics', () => {
    expect(getSplatCollisionDevStatus({ NODE_ENV: 'development' }, '127.0.0.1:3001', '::1')).toEqual({
      ok: true,
      enabled: true,
      localOnly: true,
      production: false
    });

    expect(getSplatCollisionDevStatus({ NODE_ENV: 'production' }, '127.0.0.1:3001', '::1')).toMatchObject({
      ok: true,
      enabled: false,
      localOnly: true,
      production: true
    });
  });

  it('requires an unlocked dev access token for mutating local dev requests', () => {
    const env = {
      NODE_ENV: 'development',
      DEV_ACCESS_PASSWORD_SALT: '00112233445566778899aabbccddeeff',
      DEV_ACCESS_PASSWORD_KEY: '00'.repeat(32)
    };

    expect(isDevPostRequestAuthorized(env, undefined, '127.0.0.1:3001', '::1')).toMatchObject({
      ok: false,
      error: 'Dev access token required.'
    });
  });

  it('persists generated collision URLs into matching arena preset files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'magic-casters-preset-'));
    const presetDir = join(root, 'client', 'public', 'arena-presets');
    await mkdir(presetDir, { recursive: true });
    await writeFile(join(presetDir, 'businesspark-belp-1og-ost.json'), JSON.stringify({
      presetId: 'businesspark-belp-1og-ost',
      splatUrl: '/splats/businesspark-belp-1og-ost.sog',
      collisionMeshUrl: null,
      voxelCollisionUrl: null
    }, null, 2));
    await writeFile(join(presetDir, 'splat-test.json'), JSON.stringify({
      presetId: 'businesspark-belp-1og-ost',
      splatUrl: '/splats/businesspark-belp-1og-ost.sog',
      collisionMeshUrl: null,
      voxelCollisionUrl: null
    }, null, 2));

    const updated = await persistCollisionUrlsToPresetFiles(root, {
      arenaId: 'businesspark-belp-1og-ost',
      splatFilename: 'businesspark-belp-1og-ost.sog',
      collisionMeshUrl: '/collision/businesspark-belp-1og-ost.collision.glb',
      voxelCollisionUrl: '/collision/businesspark-belp-1og-ost.voxel.json',
      playableFilterBox: null
    });

    expect(updated).toEqual([
      'arena-presets/businesspark-belp-1og-ost.json',
      'arena-presets/splat-test.json'
    ]);
    const preset = JSON.parse(await readFile(join(presetDir, 'businesspark-belp-1og-ost.json'), 'utf8'));
    expect(preset).toMatchObject({
      collisionMeshUrl: '/collision/businesspark-belp-1og-ost.collision.glb',
      voxelCollisionUrl: '/collision/businesspark-belp-1og-ost.voxel.json'
    });
  });

  it('publishes a calibrated map into the project preset catalog', async () => {
    const root = await mkdtemp(join(tmpdir(), 'magic-casters-publish-'));
    const presetDir = join(root, 'client', 'public', 'arena-presets');
    await mkdir(presetDir, { recursive: true });
    await writeFile(join(presetDir, 'splat-catalog.json'), JSON.stringify({
      defaultPresetId: 'businesspark-belp-1og-ost',
      maps: []
    }, null, 2));

    const updated = await persistArenaPresetToProject(root, {
      presetId: 'businesspark-belp-1og-ost',
      arenaId: 'splat-test',
      displayName: 'Businesspark Belp 1OG Ost',
      type: 'splat',
      splatUrl: '/splats/businesspark-belp-1og-ost.sog',
      splatFileSizeBytes: 14381152,
      collisionMeshUrl: '/collision/businesspark-belp-1og-ost.collision.glb',
      voxelCollisionUrl: '/collision/businesspark-belp-1og-ost.voxel.json',
      enabledModes: ['1v1', '2v2'],
      spawnPoints: [
        { x: -1, y: 0, z: 0, rotY: -1 },
        { x: 1, y: 0, z: 0, rotY: 1 }
      ],
      spawnPointsByMode: {
        '2v2': [
          { x: -2, y: 0, z: -1, rotY: -1 },
          { x: 2, y: 0, z: 1, rotY: 1 },
          { x: -2, y: 0, z: 1, rotY: -1 },
          { x: 2, y: 0, z: -1, rotY: 1 }
        ]
      },
      bounds: { minX: -8, maxX: 8, minZ: -6, maxZ: 6 },
      scale: 1,
      rotation: { x: 180, y: 180, z: 0 },
      offset: { x: 0, y: 0, z: 0 },
      floorY: 0,
      collisionErasers: [],
      collisionWalls: []
    });

    expect(updated).toEqual([
      'arena-presets/businesspark-belp-1og-ost.json',
      'arena-presets/splat-catalog.json'
    ]);

    const catalog = JSON.parse(await readFile(join(presetDir, 'splat-catalog.json'), 'utf8'));
    expect(catalog.maps[0]).toMatchObject({
      presetId: 'businesspark-belp-1og-ost',
      enabledModes: ['1v1', '2v2']
    });
    const preset = JSON.parse(await readFile(join(presetDir, 'businesspark-belp-1og-ost.json'), 'utf8'));
    expect(preset.spawnPointsByMode['2v2']).toHaveLength(4);
  });

  it('keeps published collision assets when a later publish omits them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'magic-casters-publish-preserve-'));
    const presetDir = join(root, 'client', 'public', 'arena-presets');
    await mkdir(presetDir, { recursive: true });
    await writeFile(join(presetDir, 'businesspark-belp-1og-ost.json'), JSON.stringify({
      presetId: 'businesspark-belp-1og-ost',
      arenaId: 'splat-test',
      displayName: 'Businesspark',
      type: 'splat',
      splatUrl: '/splats/businesspark-belp-1og-ost.sog',
      collisionMeshUrl: '/collision/businesspark-belp-1og-ost.collision.glb',
      voxelCollisionUrl: '/collision/businesspark-belp-1og-ost.voxel.json',
      collisionWalls: [{ id: 'wall-a', x: 1, z: 2, width: 3, depth: 4, height: 5, rotY: 0 }],
      collisionErasers: [{ id: 'erase-a', x: 0, z: 0, width: 1, depth: 1, height: 2, rotY: 0 }]
    }, null, 2));
    await writeFile(join(presetDir, 'splat-catalog.json'), JSON.stringify({
      defaultPresetId: 'businesspark-belp-1og-ost',
      maps: []
    }, null, 2));

    await persistArenaPresetToProject(root, {
      presetId: 'businesspark-belp-1og-ost',
      arenaId: 'splat-test',
      displayName: 'Businesspark Updated',
      type: 'splat',
      splatUrl: '/splats/businesspark-belp-1og-ost.sog',
      enabledModes: ['1v1'],
      spawnPoints: [
        { x: -1, y: 0, z: 0, rotY: -1 },
        { x: 1, y: 0, z: 0, rotY: 1 }
      ],
      bounds: { minX: -8, maxX: 8, minZ: -6, maxZ: 6 },
      scale: 1,
      rotation: { x: 180, y: 180, z: 0 },
      offset: { x: 0, y: 0, z: 0 },
      floorY: 0
    });

    const preset = JSON.parse(await readFile(join(presetDir, 'businesspark-belp-1og-ost.json'), 'utf8'));
    expect(preset.collisionMeshUrl).toBe('/collision/businesspark-belp-1og-ost.collision.glb');
    expect(preset.voxelCollisionUrl).toBe('/collision/businesspark-belp-1og-ost.voxel.json');
    expect(preset.collisionWalls).toHaveLength(1);
    expect(preset.collisionErasers).toHaveLength(1);
  });
});
