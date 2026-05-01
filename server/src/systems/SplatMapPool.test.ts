import { describe, expect, it } from 'vitest';
import {
  compactSplatMapCatalog,
  enabledSplatMapsForMode,
  findSplatMapEntry,
  resolveEnabledModes,
  resolveSplatQualityEntry,
  resolveSpawnPointsForMode,
  selectRandomSplatMapForMode
} from '../../../shared/splatMapPool';

describe('splat map pool helpers', () => {
  const oneVOneSpawns = [
    { x: -1, y: 0, z: 0, rotY: -1 },
    { x: 1, y: 0, z: 0, rotY: 1 }
  ];
  const twoVTwoSpawns = [
    { x: -2, y: 0, z: -1, rotY: -1 },
    { x: 2, y: 0, z: 1, rotY: 1 },
    { x: -2, y: 0, z: 1, rotY: -1 },
    { x: 2, y: 0, z: -1, rotY: 1 }
  ];

  it('defaults legacy splat presets to 1v1 only', () => {
    expect(resolveEnabledModes({})).toEqual(['1v1']);
    expect(resolveEnabledModes({ enabledModes: ['2v2', 'bogus', '1v1'] })).toEqual(['2v2', '1v1']);
  });

  it('resolves mode-specific spawn points with legacy fallback', () => {
    const preset = {
      spawnPoints: oneVOneSpawns,
      spawnPointsByMode: {
        '2v2': twoVTwoSpawns
      }
    };

    expect(resolveSpawnPointsForMode(preset, '1v1')).toEqual(oneVOneSpawns);
    expect(resolveSpawnPointsForMode(preset, '2v2')).toEqual(twoVTwoSpawns);
    expect(resolveSpawnPointsForMode({ spawnPoints: oneVOneSpawns }, '2v2')).toHaveLength(4);
  });

  it('filters and chooses random maps by mode only', () => {
    const catalog = {
      defaultPresetId: 'business',
      maps: [
        { presetId: 'business', displayName: 'Business', presetUrl: '/arena-presets/business.json', splatUrl: '/splats/business.sog', enabledModes: ['1v1'] },
        { presetId: 'moscow', displayName: 'Moscow', presetUrl: '/arena-presets/moscow.json', splatUrl: '/splats/moscow.sog', enabledModes: ['2v2'] },
        { presetId: 'both', displayName: 'Both', presetUrl: '/arena-presets/both.json', splatUrl: '/splats/both.sog', enabledModes: ['1v1', '2v2'] }
      ]
    };

    expect(enabledSplatMapsForMode(catalog, '1v1').map((entry) => entry.presetId)).toEqual(['business', 'both']);
    expect(enabledSplatMapsForMode(catalog, '2v2').map((entry) => entry.presetId)).toEqual(['moscow', 'both']);
    expect(selectRandomSplatMapForMode(catalog, '2v2', () => 0)?.presetId).toBe('moscow');
    expect(selectRandomSplatMapForMode({ defaultPresetId: 'none', maps: [] }, '1v1')).toBeNull();
  });

  it('groups quality variants under one playable map for lobby previews', () => {
    const catalog = {
      defaultPresetId: 'arcane-library',
      maps: [
        {
          presetId: 'arcane-library',
          calibrationGroupId: 'arcane-library',
          displayName: 'Arcane Library',
          presetUrl: '/arena-presets/arcane-library-high.json',
          splatUrl: '/splats/arcane-library-high.sog',
          enabledModes: [],
          defaultQuality: 'high' as const,
          qualities: {
            low: {
              presetId: 'arcane-library-low',
              presetUrl: '/arena-presets/arcane-library-low.json',
              splatUrl: '/splats/arcane-library-low.sog'
            },
            high: {
              presetId: 'arcane-library-high',
              presetUrl: '/arena-presets/arcane-library-high.json',
              splatUrl: '/splats/arcane-library-high.sog'
            }
          }
        },
        {
          presetId: 'arcane-library-low',
          displayName: 'Arcane Library (LOW)',
          presetUrl: '/arena-presets/arcane-library-low.json',
          splatUrl: '/splats/arcane-library-low.sog',
          enabledModes: ['1v1']
        },
        {
          presetId: 'arcane-library-high',
          displayName: 'Arcane Library (HIGH)',
          presetUrl: '/arena-presets/arcane-library-high.json',
          splatUrl: '/splats/arcane-library-high.sog',
          enabledModes: ['1v1', '2v2']
        }
      ]
    };

    const maps = compactSplatMapCatalog(catalog, { includeUnassigned: true });

    expect(maps).toHaveLength(1);
    expect(maps[0]).toMatchObject({
      presetId: 'arcane-library',
      displayName: 'Arcane Library',
      enabledModes: ['1v1', '2v2']
    });
    expect(maps[0]?.qualities?.high?.presetId).toBe('arcane-library-high');
  });

  it('resolves quality variant ids to their canonical map group', () => {
    const catalog = {
      defaultPresetId: 'lobby-high',
      maps: [
        {
          presetId: 'lobby-high',
          calibrationGroupId: 'lobby-high',
          displayName: 'Lobby',
          presetUrl: '/arena-presets/lobby-high.json',
          splatUrl: '/splats/lobby-high.sog',
          enabledModes: ['1v1'],
          defaultQuality: 'high' as const,
          qualities: {
            low: { presetId: 'lobby-low', presetUrl: '/arena-presets/lobby-low.json', splatUrl: '/splats/lobby-low.sog' },
            mid: { presetId: 'lobby-mid', presetUrl: '/arena-presets/lobby-mid.json', splatUrl: '/splats/lobby-mid.sog' },
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
    };

    const entry = findSplatMapEntry(catalog, 'lobby-low');

    expect(entry?.presetId).toBe('lobby-high');
    expect(resolveSplatQualityEntry(entry!, 'low').presetId).toBe('lobby-low');
    expect(resolveSplatQualityEntry(entry!, 'high').presetId).toBe('lobby-high');
  });

  it('does not fall back to lobby when strict playable lookup misses', () => {
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
          defaultQuality: 'high' as const,
          qualities: {
            low: { presetId: 'lobby-low', presetUrl: '/arena-presets/lobby-low.json', splatUrl: '/splats/lobby-low.sog' },
            high: { presetId: 'lobby-high', presetUrl: '/arena-presets/lobby-high.json', splatUrl: '/splats/lobby-high.sog' }
          }
        },
        {
          presetId: 'arcane-library',
          calibrationGroupId: 'arcane-library',
          displayName: 'Arcane Library',
          presetUrl: '/arena-presets/arcane-library-high.json',
          splatUrl: '/splats/arcane-library-high.sog',
          enabledModes: ['1v1'],
          defaultQuality: 'high' as const,
          qualities: {
            high: { presetId: 'arcane-library-high', presetUrl: '/arena-presets/arcane-library-high.json', splatUrl: '/splats/arcane-library-high.sog' }
          }
        }
      ]
    };

    expect(findSplatMapEntry(catalog, 'missing-map', { strict: true, playableOnly: true })).toBeNull();
    expect(findSplatMapEntry(catalog, 'lobby-low', { strict: true, playableOnly: true })).toBeNull();
    expect(findSplatMapEntry(catalog, 'arcane-library-high', { strict: true, playableOnly: true })?.presetId)
      .toBe('arcane-library');
  });
});
