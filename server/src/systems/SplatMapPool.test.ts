import { describe, expect, it } from 'vitest';
import {
  enabledSplatMapsForMode,
  resolveEnabledModes,
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
});
