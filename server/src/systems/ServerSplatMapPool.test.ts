import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { selectPublishedSplatArenaByPresetId, selectPublishedSplatArenaForMode } from './ServerSplatMapPool';

describe('server published splat map pool', () => {
  it('loads a mode-compatible preset and resolves mode-specific spawns', async () => {
    const root = await mkdtemp(join(tmpdir(), 'magic-casters-pool-'));
    const presetDir = join(root, 'client', 'public', 'arena-presets');
    await mkdir(presetDir, { recursive: true });
    await writeFile(join(presetDir, 'splat-catalog.json'), JSON.stringify({
      defaultPresetId: 'business',
      maps: [
        { presetId: 'business', displayName: 'Business', presetUrl: '/arena-presets/business.json', splatUrl: '/splats/business.sog', enabledModes: ['1v1'] },
        { presetId: 'teams', displayName: 'Teams', presetUrl: '/arena-presets/teams.json', splatUrl: '/splats/teams.sog', enabledModes: ['2v2'] }
      ]
    }));
    await writeFile(join(presetDir, 'teams.json'), JSON.stringify({
      presetId: 'teams',
      arenaId: 'splat-test',
      displayName: 'Teams',
      type: 'splat',
      splatUrl: '/splats/teams.sog',
      collisionMeshUrl: null,
      voxelCollisionUrl: null,
      spawnPoints: [
        { x: -1, y: 0, z: 0, rotY: -1 },
        { x: 1, y: 0, z: 0, rotY: 1 }
      ],
      spawnPointsByMode: {
        '2v2': [
          { x: -4, y: 0, z: -1, rotY: -1 },
          { x: 4, y: 0, z: 1, rotY: 1 },
          { x: -4, y: 0, z: 1, rotY: -1 },
          { x: 4, y: 0, z: -1, rotY: 1 }
        ]
      },
      bounds: { minX: -8, maxX: 8, minZ: -6, maxZ: 6 },
      scale: 1,
      rotation: { x: 0, y: 0, z: 0 },
      offset: { x: 0, y: 0, z: 0 },
      floorY: 0,
      collisionErasers: [],
      collisionWalls: []
    }));

    const selected = selectPublishedSplatArenaForMode('2v2', root, () => 0);
    expect(selected?.presetId).toBe('teams');
    expect(selected?.collision.spawnPoints).toHaveLength(4);
    expect(selected?.presetUrl).toBe('/arena-presets/teams.json');
  });

  it('falls back to lightweight when no map is enabled for the mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'magic-casters-pool-empty-'));
    const presetDir = join(root, 'client', 'public', 'arena-presets');
    await mkdir(presetDir, { recursive: true });
    await writeFile(join(presetDir, 'splat-catalog.json'), JSON.stringify({
      defaultPresetId: 'business',
      maps: [
        { presetId: 'business', displayName: 'Business', presetUrl: '/arena-presets/business.json', splatUrl: '/splats/business.sog', enabledModes: ['1v1'] }
      ]
    }));

    expect(selectPublishedSplatArenaForMode('2v2', root, () => 0)).toBeNull();
  });

  it('never selects lobby variants as playable published arenas', async () => {
    const root = await mkdtemp(join(tmpdir(), 'magic-casters-pool-lobby-'));
    const presetDir = join(root, 'client', 'public', 'arena-presets');
    await mkdir(presetDir, { recursive: true });
    await writeFile(join(presetDir, 'splat-catalog.json'), JSON.stringify({
      defaultPresetId: 'lobby-high',
      maps: [
        {
          presetId: 'lobby',
          calibrationGroupId: 'lobby',
          displayName: 'Lobby',
          presetUrl: '/arena-presets/lobby-high.json',
          splatUrl: '/splats/lobby-high.sog',
          enabledModes: [],
          defaultQuality: 'high',
          qualities: {
            low: { presetId: 'lobby-low', presetUrl: '/arena-presets/lobby-low.json', splatUrl: '/splats/lobby-low.sog' },
            high: { presetId: 'lobby-high', presetUrl: '/arena-presets/lobby-high.json', splatUrl: '/splats/lobby-high.sog' }
          }
        },
        {
          presetId: 'lobby-low',
          displayName: 'Lobby (LOW)',
          presetUrl: '/arena-presets/lobby-low.json',
          splatUrl: '/splats/lobby-low.sog',
          enabledModes: ['1v1']
        }
      ]
    }));
    const lobbyPreset = {
      arenaId: 'splat-test',
      displayName: 'Lobby',
      type: 'splat',
      splatUrl: '/splats/lobby-high.sog',
      enabledModes: ['1v1'],
      spawnPoints: [
        { x: -1, y: 0, z: 0, rotY: 0 },
        { x: 1, y: 0, z: 0, rotY: 0 }
      ],
      bounds: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 },
      scale: 1,
      rotation: { x: 0, y: 0, z: 0 },
      offset: { x: 0, y: 0, z: 0 },
      floorY: 0,
      collisionWalls: []
    };
    await writeFile(join(presetDir, 'lobby-high.json'), JSON.stringify({ ...lobbyPreset, presetId: 'lobby-high' }));
    await writeFile(join(presetDir, 'lobby-low.json'), JSON.stringify({ ...lobbyPreset, presetId: 'lobby-low' }));

    expect(selectPublishedSplatArenaForMode('1v1', root, () => 0)).toBeNull();
    expect(selectPublishedSplatArenaByPresetId('lobby-low', '1v1', root)).toBeNull();
  });

  it('loads the default quality variant from grouped splat catalog entries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'magic-casters-pool-quality-'));
    const presetDir = join(root, 'client', 'public', 'arena-presets');
    await mkdir(presetDir, { recursive: true });
    await writeFile(join(presetDir, 'splat-catalog.json'), JSON.stringify({
      defaultPresetId: 'crystal-palace',
      maps: [
        {
          presetId: 'crystal-palace',
          calibrationGroupId: 'crystal-palace',
          displayName: 'Crystal Palace',
          presetUrl: '/arena-presets/crystal-palace-high.json',
          splatUrl: '/splats/crystal-palace-high.sog',
          enabledModes: ['1v1'],
          defaultQuality: 'mid',
          qualities: {
            low: {
              presetId: 'crystal-palace-low',
              presetUrl: '/arena-presets/crystal-palace-low.json',
              splatUrl: '/splats/crystal-palace-low.sog'
            },
            mid: {
              presetId: 'crystal-palace-mid',
              presetUrl: '/arena-presets/crystal-palace-mid.json',
              splatUrl: '/splats/crystal-palace-mid.sog'
            },
            high: {
              presetId: 'crystal-palace-high',
              presetUrl: '/arena-presets/crystal-palace-high.json',
              splatUrl: '/splats/crystal-palace-high.sog'
            }
          }
        }
      ]
    }));
    await writeFile(join(presetDir, 'crystal-palace-mid.json'), JSON.stringify({
      presetId: 'crystal-palace-mid',
      calibrationGroupId: 'crystal-palace',
      quality: 'mid',
      arenaId: 'splat-test',
      displayName: 'Crystal Palace (MID)',
      type: 'splat',
      splatUrl: '/splats/crystal-palace-mid.sog',
      collisionMeshUrl: null,
      voxelCollisionUrl: null,
      spawnPoints: [
        { x: -2, y: 0, z: 0, rotY: -1 },
        { x: 2, y: 0, z: 0, rotY: 1 }
      ],
      bounds: { minX: -8, maxX: 8, minZ: -6, maxZ: 6 },
      scale: 1,
      rotation: { x: 0, y: 0, z: 0 },
      offset: { x: 0, y: 0, z: 0 },
      floorY: 0,
      collisionErasers: [],
      collisionWalls: []
    }));

    const selected = selectPublishedSplatArenaForMode('1v1', root, () => 0);
    expect(selected?.presetId).toBe('crystal-palace-mid');
    expect(selected?.displayName).toBe('Crystal Palace');
    expect(selected?.presetUrl).toBe('/arena-presets/crystal-palace-mid.json');
    expect(selected?.collision.spawnPoints[0]?.x).toBe(-2);
  });

  it('loads a custom map by grouped preset id without exposing quality variants', async () => {
    const root = await mkdtemp(join(tmpdir(), 'magic-casters-pool-custom-'));
    const presetDir = join(root, 'client', 'public', 'arena-presets');
    await mkdir(presetDir, { recursive: true });
    await writeFile(join(presetDir, 'splat-catalog.json'), JSON.stringify({
      defaultPresetId: 'dragon-bridge',
      maps: [
        {
          presetId: 'dragon-bridge',
          calibrationGroupId: 'dragon-bridge',
          displayName: 'Dragon Bridge',
          presetUrl: '/arena-presets/dragon-bridge-high.json',
          splatUrl: '/splats/dragon-bridge-high.sog',
          enabledModes: [],
          defaultQuality: 'high',
          qualities: {
            high: {
              presetId: 'dragon-bridge-high',
              presetUrl: '/arena-presets/dragon-bridge-high.json',
              splatUrl: '/splats/dragon-bridge-high.sog'
            }
          }
        }
      ]
    }));
    await writeFile(join(presetDir, 'dragon-bridge-high.json'), JSON.stringify({
      presetId: 'dragon-bridge-high',
      calibrationGroupId: 'dragon-bridge',
      quality: 'high',
      arenaId: 'splat-test',
      displayName: 'Dragon Bridge (HIGH)',
      type: 'splat',
      splatUrl: '/splats/dragon-bridge-high.sog',
      collisionMeshUrl: null,
      voxelCollisionUrl: null,
      spawnPoints: [
        { x: -3, y: 0, z: 0, rotY: -1 },
        { x: 3, y: 0, z: 0, rotY: 1 }
      ],
      spawnPointsByMode: {
        '2v2': [
          { x: -4, y: 0, z: -1, rotY: -1 },
          { x: 4, y: 0, z: 1, rotY: 1 },
          { x: -4, y: 0, z: 1, rotY: -1 },
          { x: 4, y: 0, z: -1, rotY: 1 }
        ]
      },
      bounds: { minX: -8, maxX: 8, minZ: -6, maxZ: 6 },
      scale: 1,
      rotation: { x: 0, y: 0, z: 0 },
      offset: { x: 0, y: 0, z: 0 },
      floorY: 0,
      collisionErasers: [],
      collisionWalls: []
    }));

    const selected = selectPublishedSplatArenaByPresetId('dragon-bridge', '2v2', root);

    expect(selected?.presetId).toBe('dragon-bridge-high');
    expect(selected?.displayName).toBe('Dragon Bridge');
    expect(selected?.presetUrl).toBe('/arena-presets/dragon-bridge-high.json');
    expect(selected?.collision.spawnPoints).toHaveLength(4);
  });

  it('skips presets whose voxel collision asset is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'magic-casters-pool-missing-voxel-'));
    const presetDir = join(root, 'client', 'public', 'arena-presets');
    await mkdir(presetDir, { recursive: true });
    await writeFile(join(presetDir, 'splat-catalog.json'), JSON.stringify({
      defaultPresetId: 'broken',
      maps: [
        { presetId: 'broken', displayName: 'Broken', presetUrl: '/arena-presets/broken.json', splatUrl: '/splats/broken.sog', enabledModes: ['1v1'] }
      ]
    }));
    await writeFile(join(presetDir, 'broken.json'), JSON.stringify({
      presetId: 'broken',
      arenaId: 'splat-test',
      displayName: 'Broken',
      type: 'splat',
      splatUrl: '/splats/broken.sog',
      collisionMeshUrl: null,
      voxelCollisionUrl: '/collision/broken.voxel.json',
      spawnPoints: [
        { x: -1, y: 0, z: 0, rotY: -1 },
        { x: 1, y: 0, z: 0, rotY: 1 }
      ],
      bounds: { minX: -8, maxX: 8, minZ: -6, maxZ: 6 },
      scale: 1,
      rotation: { x: 0, y: 0, z: 0 },
      offset: { x: 0, y: 0, z: 0 },
      floorY: 0,
      collisionErasers: [],
      collisionWalls: []
    }));

    expect(selectPublishedSplatArenaForMode('1v1', root, () => 0)).toBeNull();
  });

  it('preserves authored spawn points without snapping', async () => {
    const root = await mkdtemp(join(tmpdir(), 'magic-casters-pool-spawn-preserve-'));
    const presetDir = join(root, 'client', 'public', 'arena-presets');
    const collisionDir = join(root, 'client', 'public', 'collision');
    await mkdir(presetDir, { recursive: true });
    await mkdir(collisionDir, { recursive: true });
    await writeFile(join(presetDir, 'splat-catalog.json'), JSON.stringify({
      defaultPresetId: 'snap',
      maps: [
        { presetId: 'snap', displayName: 'Snap', presetUrl: '/arena-presets/snap.json', splatUrl: '/splats/snap.sog', enabledModes: ['1v1'] }
      ]
    }));
    await writeFile(join(presetDir, 'snap.json'), JSON.stringify({
      presetId: 'snap',
      arenaId: 'splat-test',
      displayName: 'Snap',
      type: 'splat',
      splatUrl: '/splats/snap.sog',
      collisionMeshUrl: null,
      voxelCollisionUrl: '/collision/snap.voxel.json',
      spawnPoints: [
        { x: 1.5, y: 0.75, z: 1.5, rotY: 0 },
        { x: 2.5, y: 0.75, z: 2.5, rotY: 0 }
      ],
      bounds: { minX: -8, maxX: 8, minZ: -6, maxZ: 6 },
      scale: 1,
      rotation: { x: 0, y: 0, z: 0 },
      offset: { x: 0, y: 0, z: 0 },
      floorY: -2,
      collisionErasers: [],
      collisionWalls: []
    }));
    await writeFile(join(collisionDir, 'snap.voxel.json'), JSON.stringify({
      version: '1.1',
      gridBounds: { min: [0, 0, 0], max: [4, 4, 4] },
      sceneBounds: { min: [0, 0, 0], max: [4, 4, 4] },
      voxelResolution: 1,
      leafSize: 4,
      treeDepth: 0,
      numInteriorNodes: 0,
      numMixedLeaves: 1,
      nodeCount: 1,
      leafDataCount: 2
    }));
    await writeFile(join(collisionDir, 'snap.voxel.bin'), Buffer.from(new Uint32Array([0, 1 << 17, 0]).buffer));

    const selected = selectPublishedSplatArenaForMode('1v1', root, () => 0);
    expect(selected?.collision.spawnPoints[0]?.y).toBe(0.75);
  });

  it('loads the real Celestial Marble public preset for every enabled match mode', () => {
    const repoRoot = join(process.cwd(), '..');

    for (const mode of ['1v1', '2v2'] as const) {
      const selected = selectPublishedSplatArenaByPresetId('celestial-marble-crystal-palace', mode, repoRoot);

      expect(selected, `Celestial Marble should load for ${mode}`).not.toBeNull();
      expect(selected?.presetId).toBe('celestial-marble-crystal-palace-high');
      expect(selected?.presetUrl).toBe('/arena-presets/celestial-marble-crystal-palace-high.json');
      expect(selected?.collision.voxelCollisionUrl).toBeNull();
      expect(selected?.collision.spawnPoints).toHaveLength(mode === '2v2' ? 4 : 2);
    }
  });

  it('loads the real Grand Ornate Marble Hallway public preset for every enabled match mode', () => {
    const repoRoot = join(process.cwd(), '..');

    for (const mode of ['1v1', '2v2'] as const) {
      const selected = selectPublishedSplatArenaByPresetId('grand-ornate-marble-hallway', mode, repoRoot);

      expect(selected, `Grand Ornate Marble Hallway should load for ${mode}`).not.toBeNull();
      expect(selected?.presetId).toBe('grand-ornate-marble-hallway-high');
      expect(selected?.presetUrl).toBe('/arena-presets/grand-ornate-marble-hallway-high.json');
      expect(selected?.collision.voxelCollisionUrl).toBeNull();
      expect(selected?.collision.spawnPoints).toHaveLength(mode === '2v2' ? 4 : 2);
    }
  });
});
