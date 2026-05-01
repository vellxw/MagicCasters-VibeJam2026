import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPlayableSplatArenaPreset, loadConfiguredSplatArenaPreset } from './ArenaPreset';

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
      )
    };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
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
});
