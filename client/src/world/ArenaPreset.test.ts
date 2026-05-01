import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPlayableSplatArenaPreset, loadConfiguredSplatArenaPreset, normalizeSplatArenaPreset } from './ArenaPreset';

describe('ArenaPreset quality resolution', () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    const catalog = {
      defaultPresetId: 'lobby-high',
      maps: [
        {
          presetId: 'lobby-high',
          calibrationGroupId: 'lobby-high',
          displayName: 'Lobby',
          presetUrl: '/arena-presets/lobby-high.json',
          splatUrl: '/splats/lobby-high.sog',
          enabledModes: [],
          defaultQuality: 'high',
          qualities: {
            low: {
              presetId: 'lobby-low',
              presetUrl: '/arena-presets/lobby-low.json',
              splatUrl: '/splats/lobby-low.sog',
              splatFileSizeBytes: 6
            },
            mid: {
              presetId: 'lobby-mid',
              presetUrl: '/arena-presets/lobby-mid.json',
              splatUrl: '/splats/lobby-mid.sog',
              splatFileSizeBytes: 12
            },
            high: {
              presetId: 'lobby-high',
              presetUrl: '/arena-presets/lobby-high.json',
              splatUrl: '/splats/lobby-high.sog',
              splatFileSizeBytes: 24
            }
          }
        },
        {
          presetId: 'lobby-low',
          displayName: 'Lobby (LOW)',
          presetUrl: '/arena-presets/lobby-low.json',
          splatUrl: '/splats/lobby-low.sog',
          splatFileSizeBytes: 6,
          enabledModes: []
        },
        {
          presetId: 'arcane-library',
          calibrationGroupId: 'arcane-library',
          displayName: 'Arcane Library',
          presetUrl: '/arena-presets/arcane-library-high.json',
          splatUrl: '/splats/arcane-library-high.sog',
          splatFileSizeBytes: 18,
          enabledModes: ['1v1'],
          defaultQuality: 'high',
          qualities: {
            high: {
              presetId: 'arcane-library-high',
              presetUrl: '/arena-presets/arcane-library-high.json',
              splatUrl: '/splats/arcane-library-high.sog',
              splatFileSizeBytes: 18
            }
          }
        },
        {
          presetId: 'the-dragon-gate-bridge',
          calibrationGroupId: 'the-dragon-gate-bridge',
          displayName: 'The Dragon Gate Bridge',
          presetUrl: '/arena-presets/the-dragon-gate-bridge-high.json',
          splatUrl: '/splats/the-dragon-gate-bridge-high.sog',
          splatFileSizeBytes: 24,
          enabledModes: [],
          defaultQuality: 'high',
          qualities: {
            low: {
              presetId: 'the-dragon-gate-bridge-low',
              presetUrl: '/arena-presets/the-dragon-gate-bridge-low.json',
              splatUrl: '/splats/the-dragon-gate-bridge-low.sog',
              splatFileSizeBytes: 6
            },
            mid: {
              presetId: 'the-dragon-gate-bridge-mid',
              presetUrl: '/arena-presets/the-dragon-gate-bridge-mid.json',
              splatUrl: '/splats/the-dragon-gate-bridge-mid.sog',
              splatFileSizeBytes: 12
            },
            high: {
              presetId: 'the-dragon-gate-bridge-high',
              presetUrl: '/arena-presets/the-dragon-gate-bridge-high.json',
              splatUrl: '/splats/the-dragon-gate-bridge-high.sog',
              splatFileSizeBytes: 24
            }
          }
        },
        {
          presetId: 'the-dragon-gate-bridge-high',
          displayName: 'The Dragon Gate Bridge (HIGH)',
          presetUrl: '/arena-presets/the-dragon-gate-bridge-high.json',
          splatUrl: '/splats/the-dragon-gate-bridge-high.sog',
          splatFileSizeBytes: 24,
          enabledModes: ['1v1']
        },
        {
          presetId: 'the-dragon-gate-bridge-low',
          displayName: 'The Dragon Gate Bridge (LOW)',
          presetUrl: '/arena-presets/the-dragon-gate-bridge-low.json',
          splatUrl: '/splats/the-dragon-gate-bridge-low.sog',
          splatFileSizeBytes: 6,
          enabledModes: ['1v1']
        },
        {
          presetId: 'the-dragon-gate-bridge-mid',
          displayName: 'The Dragon Gate Bridge (MID)',
          presetUrl: '/arena-presets/the-dragon-gate-bridge-mid.json',
          splatUrl: '/splats/the-dragon-gate-bridge-mid.sog',
          splatFileSizeBytes: 12,
          enabledModes: ['1v1']
        }
      ]
    };

    const preset = (
      presetId: string,
      quality: 'low' | 'mid' | 'high',
      splatUrl: string,
      calibrationGroupId = 'lobby-high',
      displayName = 'Lobby',
      enabledModes: string[] = []
    ) => ({
      presetId,
      calibrationGroupId,
      quality,
      arenaId: 'splat-test',
      displayName,
      type: 'splat',
      splatUrl,
      splatFileSizeBytes: quality === 'low' ? 6 : quality === 'mid' ? 12 : 24,
      enabledModes,
      collisionMeshUrl: null,
      voxelCollisionUrl: null,
      spawnPoints: [
        { x: 0, y: 0, z: 0, rotY: 0 },
        { x: 1, y: 0, z: 0, rotY: 0 }
      ],
      bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
      scale: 1,
      rotation: { x: 0, y: 0, z: 0 },
      offset: { x: 0, y: 0, z: 0 },
      floorY: 0,
      collisionErasers: [],
      collisionWalls: []
    });

    const responses: Record<string, unknown> = {
      '/arena-presets/splat-catalog.json': catalog,
      '/arena-presets/lobby-low.json': preset('lobby-low', 'low', '/splats/lobby-low.sog'),
      '/arena-presets/lobby-mid.json': preset('lobby-mid', 'mid', '/splats/lobby-mid.sog'),
      '/arena-presets/lobby-high.json': preset('lobby-high', 'high', '/splats/lobby-high.sog'),
      '/arena-presets/arcane-library-high.json': preset(
        'arcane-library-high',
        'high',
        '/splats/arcane-library-high.sog',
        'arcane-library',
        'Arcane Library',
        ['1v1']
      ),
      '/arena-presets/the-dragon-gate-bridge-low.json': preset(
        'the-dragon-gate-bridge-low',
        'low',
        '/splats/the-dragon-gate-bridge-low.sog',
        'the-dragon-gate-bridge',
        'The Dragon Gate Bridge (LOW)',
        ['1v1']
      ),
      '/arena-presets/the-dragon-gate-bridge-mid.json': preset(
        'the-dragon-gate-bridge-mid',
        'mid',
        '/splats/the-dragon-gate-bridge-mid.sog',
        'the-dragon-gate-bridge',
        'The Dragon Gate Bridge (MID)',
        ['1v1']
      ),
      '/arena-presets/the-dragon-gate-bridge-high.json': preset(
        'the-dragon-gate-bridge-high',
        'high',
        '/splats/the-dragon-gate-bridge-high.sog',
        'the-dragon-gate-bridge',
        'The Dragon Gate Bridge (HIGH)',
        ['1v1']
      )
    };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input).split('?')[0];
      const body = responses[url];
      return {
        ok: body !== undefined,
        status: body === undefined ? 404 : 200,
        json: async () => body
      } as Response;
    });
    globalThis.localStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0
    } as unknown as Storage;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
  });

  it('uses local quality when the server announces a quality variant preset id', async () => {
    const loaded = await loadConfiguredSplatArenaPreset('lobby-low', 'high');

    expect(loaded.entry.presetId).toBe('lobby-high');
    expect(loaded.quality).toBe('high');
    expect(loaded.preset.presetId).toBe('lobby-high');
    expect(loaded.preset.splatUrl).toBe('/splats/lobby-high.sog');
  });

  it('keeps the high quality variant when the catalog also includes direct variant entries', async () => {
    const loaded = await loadConfiguredSplatArenaPreset('the-dragon-gate-bridge', 'high');

    expect(loaded.entry.presetId).toBe('the-dragon-gate-bridge');
    expect(loaded.quality).toBe('high');
    expect(loaded.basePreset.presetId).toBe('the-dragon-gate-bridge-high');
    expect(loaded.preset.splatUrl).toBe('/splats/the-dragon-gate-bridge-high.sog');
  });

  it('does not resolve missing playable match presets to the lobby default', async () => {
    await expect(loadConfiguredSplatArenaPreset('missing-map', 'high', { strict: true, playableOnly: true }))
      .rejects.toThrow('Splat map preset not found');
  });

  it('does not allow lobby presets through playable match resolution', async () => {
    await expect(loadConfiguredSplatArenaPreset('lobby-low', 'high', { strict: true, playableOnly: true }))
      .rejects.toThrow('Splat map preset not found');
    await expect(loadConfiguredSplatArenaPreset('arcane-library-high', 'high', { strict: true, playableOnly: true }))
      .resolves.toMatchObject({
        entry: { presetId: 'arcane-library' },
        preset: { presetId: 'arcane-library-high', splatUrl: '/splats/arcane-library-high.sog' }
      });
  });

  it('classifies direct lobby preset payloads as non-playable', () => {
    expect(isPlayableSplatArenaPreset({
      presetId: 'lobby-low',
      calibrationGroupId: 'lobby-high'
    })).toBe(false);
    expect(isPlayableSplatArenaPreset({
      presetId: 'arcane-library-high',
      calibrationGroupId: 'arcane-library'
    })).toBe(true);
  });

  it('supports Celestial Marble presets that rely only on manual collision walls', () => {
    const preset = normalizeSplatArenaPreset({
      presetId: 'celestial-marble-crystal-palace-high',
      calibrationGroupId: 'celestial-marble-crystal-palace',
      quality: 'high',
      arenaId: 'splat-test',
      displayName: 'Celestial Marble Crystal Palace (HIGH)',
      type: 'splat',
      splatUrl: '/splats/celestial-marble-crystal-palace-high.sog',
      splatFileSizeBytes: 24817657,
      enabledModes: ['1v1', '2v2'],
      collisionMeshUrl: null,
      voxelCollisionUrl: null,
      spawnPoints: [
        { x: -5.5, y: 0, z: 0, rotY: -Math.PI / 2 },
        { x: 5.5, y: 0, z: 0, rotY: Math.PI / 2 }
      ],
      spawnPointsByMode: {
        '1v1': [
          { x: -5.5, y: 0, z: 0, rotY: -Math.PI / 2 },
          { x: 5.5, y: 0, z: 0, rotY: Math.PI / 2 }
        ],
        '2v2': [
          { x: -5.5, y: 0, z: -1.25, rotY: -Math.PI / 2 },
          { x: 5.5, y: 0, z: 1.25, rotY: Math.PI / 2 },
          { x: -5.5, y: 0, z: 1.25, rotY: -Math.PI / 2 },
          { x: 5.5, y: 0, z: -1.25, rotY: Math.PI / 2 }
        ]
      },
      bounds: { minX: -8, maxX: 8, minZ: -7.4, maxZ: 7.2 },
      scale: 1,
      rotation: { x: 180, y: 180, z: 0 },
      offset: { x: 0, y: 0, z: 0 },
      floorY: -2.2,
      collisionErasers: [],
      collisionWalls: [
        {
          id: 'ramp-mon5ftww',
          x: 6.5,
          z: -0.1,
          width: 8.6,
          depth: 4,
          height: 2.7,
          rotY: 1.5687,
          climbable: false,
          ramp: true
        }
      ]
    });

    expect(preset.collisionMeshUrl).toBeNull();
    expect(preset.voxelCollisionUrl).toBeNull();
    expect(preset.enabledModes).toEqual(['1v1', '2v2']);
    expect(preset.spawnPointsByMode['2v2']).toHaveLength(4);
    expect(preset.collisionWalls.some((wall) => wall.ramp)).toBe(true);
  });
});
