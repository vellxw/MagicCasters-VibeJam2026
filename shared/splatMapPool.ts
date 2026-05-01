import {
  TEAM_SPAWNS,
  type ArenaSpawnPoint,
  type MatchMode
} from './types.js';

export interface SplatMapPoolEntry {
  presetId: string;
  calibrationGroupId?: string;
  displayName: string;
  presetUrl: string;
  splatUrl: string;
  splatFileSizeBytes?: number;
  enabledModes?: MatchMode[];
  quality?: SplatQuality;
  defaultQuality?: SplatQuality;
  qualities?: Partial<Record<SplatQuality, SplatMapQualityEntry>>;
}

export interface SplatMapQualityEntry {
  presetId: string;
  presetUrl: string;
  splatUrl: string;
  splatFileSizeBytes?: number;
}

export interface SplatMapPoolCatalog {
  defaultPresetId?: string;
  maps: SplatMapPoolEntry[];
}

export interface CompactSplatMapOptions {
  includeUnassigned?: boolean;
  excludePresetIds?: string[];
}

export interface SplatSpawnSource {
  enabledModes?: unknown;
  spawnPoints?: unknown;
  spawnPointsByMode?: unknown;
}

export const MATCH_MODE_VALUES: MatchMode[] = ['1v1', '2v2'];

export const SPLAT_QUALITY_VALUES = ['low', 'mid', 'high'] as const;

export type SplatQuality = (typeof SPLAT_QUALITY_VALUES)[number];

export function normalizeSplatQuality(value: unknown, fallback: SplatQuality = 'high'): SplatQuality {
  return value === 'low' || value === 'mid' || value === 'high' ? value : fallback;
}

export function resolveSplatQualityEntry(
  entry: SplatMapPoolEntry,
  requestedQuality?: SplatQuality
): SplatMapQualityEntry & { quality: SplatQuality } {
  const defaultQuality = normalizeSplatQuality(entry.defaultQuality ?? entry.quality, 'high');
  const qualities = entry.qualities ?? {};
  const requested = requestedQuality ?? defaultQuality;
  const quality = qualities[requested]
    ? requested
    : qualities[defaultQuality]
      ? defaultQuality
      : normalizeSplatQuality(entry.quality, defaultQuality);
  const variant = qualities[quality];
  return {
    quality,
    presetId: variant?.presetId ?? entry.presetId,
    presetUrl: variant?.presetUrl ?? entry.presetUrl,
    splatUrl: variant?.splatUrl ?? entry.splatUrl,
    splatFileSizeBytes: variant?.splatFileSizeBytes ?? entry.splatFileSizeBytes
  };
}

export function resolveEnabledModes(value: Pick<SplatSpawnSource, 'enabledModes'>): MatchMode[] {
  if (!Array.isArray(value.enabledModes)) return ['1v1'];
  const modes: MatchMode[] = [];
  for (const mode of value.enabledModes) {
    if ((mode === '1v1' || mode === '2v2') && !modes.includes(mode)) {
      modes.push(mode);
    }
  }
  return modes;
}

export function enabledSplatMapsForMode(catalog: SplatMapPoolCatalog, mode: MatchMode): SplatMapPoolEntry[] {
  return Array.isArray(catalog.maps)
    ? catalog.maps.filter((entry) => resolveEnabledModes(entry).includes(mode))
    : [];
}

export function selectRandomSplatMapForMode(
  catalog: SplatMapPoolCatalog,
  mode: MatchMode,
  random: () => number = Math.random
): SplatMapPoolEntry | null {
  const maps = enabledSplatMapsForMode(catalog, mode);
  if (maps.length === 0) return null;
  const index = Math.max(0, Math.min(maps.length - 1, Math.floor(random() * maps.length)));
  return maps[index] ?? maps[0] ?? null;
}

export function findSplatMapEntry(catalog: SplatMapPoolCatalog, presetId: string | undefined): SplatMapPoolEntry | null {
  const maps = compactSplatMapCatalog(catalog, { includeUnassigned: true });
  if (!presetId) {
    return maps.find((entry) => entry.presetId === catalog.defaultPresetId)
      ?? maps[0]
      ?? null;
  }
  return maps.find((entry) => (
    entry.presetId === presetId ||
    entry.calibrationGroupId === presetId ||
    Object.values(entry.qualities ?? {}).some((quality) => quality?.presetId === presetId)
  ))
    ?? maps.find((entry) => entry.presetId === catalog.defaultPresetId)
    ?? maps[0]
    ?? null;
}

export function compactSplatMapCatalog(
  catalog: SplatMapPoolCatalog,
  options: CompactSplatMapOptions = {}
): SplatMapPoolEntry[] {
  const excluded = new Set(options.excludePresetIds ?? []);
  const groups = new Map<string, SplatMapPoolEntry>();
  const modeSets = new Map<string, Set<MatchMode>>();
  const order: string[] = [];

  for (const entry of Array.isArray(catalog.maps) ? catalog.maps : []) {
    const groupId = mapGroupId(entry);
    if (excluded.has(groupId) || excluded.has(entry.presetId)) continue;

    if (!groups.has(groupId)) {
      order.push(groupId);
      groups.set(groupId, baseEntryForGroup(entry, groupId));
      modeSets.set(groupId, new Set(resolveEnabledModes(entry)));
    } else {
      const current = groups.get(groupId)!;
      groups.set(groupId, mergeSplatMapEntries(current, entry, groupId));
      const modes = modeSets.get(groupId)!;
      for (const mode of resolveEnabledModes(entry)) {
        modes.add(mode);
      }
    }
  }

  return order.map((groupId) => {
    const entry = groups.get(groupId)!;
    const modes = Array.from(modeSets.get(groupId) ?? []);
    return {
      ...entry,
      enabledModes: modes.length > 0
        ? modes
        : options.includeUnassigned
          ? [...MATCH_MODE_VALUES]
          : []
    };
  });
}

export function resolveSpawnPointsForMode(source: SplatSpawnSource, mode: MatchMode): ArenaSpawnPoint[] {
  const required = requiredSpawnCountForMode(mode);
  const modeSpawns = normalizeSpawnArray(readModeSpawns(source.spawnPointsByMode, mode));
  const legacySpawns = normalizeSpawnArray(source.spawnPoints);
  const fallbackSpawns = TEAM_SPAWNS[mode].map((spawn) => ({ ...spawn }));
  const resolved = (modeSpawns.length > 0 ? modeSpawns : legacySpawns).slice(0, required);

  while (resolved.length < required) {
    resolved.push({ ...fallbackSpawns[resolved.length % fallbackSpawns.length] });
  }

  return resolved.map((spawn) => ({ ...spawn }));
}

export function spawnPointsByModeForPreset(source: SplatSpawnSource): Partial<Record<MatchMode, ArenaSpawnPoint[]>> {
  return {
    '1v1': resolveSpawnPointsForMode(source, '1v1'),
    '2v2': resolveSpawnPointsForMode(source, '2v2')
  };
}

export function requiredSpawnCountForMode(mode: MatchMode): number {
  return mode === '2v2' ? 4 : 2;
}

function readModeSpawns(value: unknown, mode: MatchMode): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>)[mode];
}

function normalizeSpawnArray(value: unknown): ArenaSpawnPoint[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => normalizeSpawnPoint(entry)).filter((entry): entry is ArenaSpawnPoint => Boolean(entry));
}

function normalizeSpawnPoint(value: unknown): ArenaSpawnPoint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  return {
    x: finiteNumber(data.x, 0),
    y: finiteNumber(data.y, 0),
    z: finiteNumber(data.z, 0),
    rotY: finiteNumber(data.rotY, 0)
  };
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function mapGroupId(entry: SplatMapPoolEntry): string {
  return entry.calibrationGroupId?.trim()
    || stripQualitySuffix(entry.presetId)
    || entry.presetId;
}

function baseEntryForGroup(entry: SplatMapPoolEntry, groupId: string): SplatMapPoolEntry {
  const quality = entry.quality ?? qualityFromPresetId(entry.presetId);
  const qualities = { ...(entry.qualities ?? {}) };
  if (quality && !qualities[quality]) {
    qualities[quality] = {
      presetId: entry.presetId,
      presetUrl: entry.presetUrl,
      splatUrl: entry.splatUrl,
      splatFileSizeBytes: entry.splatFileSizeBytes
    };
  }

  return {
    ...entry,
    presetId: entry.calibrationGroupId ? entry.presetId : groupId,
    calibrationGroupId: entry.calibrationGroupId ?? groupId,
    displayName: stripQualityLabel(entry.displayName),
    enabledModes: [...resolveEnabledModes(entry)],
    qualities
  };
}

function mergeSplatMapEntries(current: SplatMapPoolEntry, entry: SplatMapPoolEntry, groupId: string): SplatMapPoolEntry {
  const incomingIsBase = Boolean(entry.qualities) || entry.presetId === groupId || entry.calibrationGroupId === entry.presetId;
  const base = incomingIsBase
    ? {
        ...entry,
        presetId: entry.presetId,
        calibrationGroupId: entry.calibrationGroupId ?? groupId,
        displayName: stripQualityLabel(entry.displayName),
        enabledModes: [...resolveEnabledModes(entry)]
      }
    : current;

  const qualities = {
    ...(current.qualities ?? {}),
    ...(entry.qualities ?? {})
  };
  const quality = entry.quality ?? qualityFromPresetId(entry.presetId);
  if (quality && !qualities[quality]) {
    qualities[quality] = {
      presetId: entry.presetId,
      presetUrl: entry.presetUrl,
      splatUrl: entry.splatUrl,
      splatFileSizeBytes: entry.splatFileSizeBytes
    };
  }

  return {
    ...base,
    presetId: base.calibrationGroupId === base.presetId ? base.presetId : current.presetId,
    calibrationGroupId: base.calibrationGroupId ?? groupId,
    displayName: stripQualityLabel(base.displayName),
    enabledModes: [...new Set([...resolveEnabledModes(current), ...resolveEnabledModes(entry)])],
    defaultQuality: base.defaultQuality ?? current.defaultQuality ?? entry.defaultQuality,
    qualities
  };
}

function qualityFromPresetId(presetId: string): SplatQuality | null {
  const match = presetId.match(/-(low|mid|high)$/);
  return match ? match[1] as SplatQuality : null;
}

function stripQualitySuffix(value: string): string {
  return value.replace(/-(low|mid|high)$/i, '');
}

function stripQualityLabel(value: string): string {
  return value.replace(/\s*\((LOW|MID|HIGH)\)\s*$/i, '').trim();
}
