import { normalizeCollisionErasers, normalizeCollisionWalls } from '../../../shared/arenaCollision';
import { clearAutoCollisionWalls } from '../../../shared/autoCollisionWalls';
import type {
  ArenaBounds,
  ArenaCollisionConfig,
  ArenaCollisionWall,
  ArenaId,
  ArenaSpawnPoint,
  MatchMode
} from '../../../shared/types';
import {
  findSplatMapEntry as findSplatMapPoolEntry,
  isPlayableSplatMapEntry,
  normalizeSplatQuality,
  resolveEnabledModes,
  resolveSplatQualityEntry,
  resolveSpawnPointsForMode,
  spawnPointsByModeForPreset,
  type SplatQuality
} from '../../../shared/splatMapPool';
import { assetUrl, getDefaultSplatQuality } from './AssetUrls';

export interface ArenaVector {
  x: number;
  y: number;
  z: number;
}

export interface SplatArenaPreset {
  presetId: string;
  presetVersion?: number;
  calibrationGroupId?: string;
  quality?: SplatQuality;
  arenaId: ArenaId;
  displayName: string;
  type: 'splat';
  splatUrl: string;
  splatFileSizeBytes?: number;
  enabledModes: MatchMode[];
  collisionMeshUrl: string | null;
  voxelCollisionUrl: string | null;
  spawnPoints: ArenaSpawnPoint[];
  spawnPointsByMode: Partial<Record<MatchMode, ArenaSpawnPoint[]>>;
  bounds: ArenaBounds;
  scale: number;
  rotation: ArenaVector;
  offset: ArenaVector;
  floorY: number;
  collisionErasers: ArenaCollisionWall[];
  collisionWalls: ArenaCollisionWall[];
}

export interface SplatCalibrationSettings {
  scale: number;
  rotation: ArenaVector;
  offset: ArenaVector;
  floorY: number;
  enabledModes: MatchMode[];
  bounds: ArenaBounds;
  spawnPoints: ArenaSpawnPoint[];
  spawnPointsByMode: Partial<Record<MatchMode, ArenaSpawnPoint[]>>;
  collisionErasers: ArenaCollisionWall[];
  collisionWalls: ArenaCollisionWall[];
}

export interface SplatMapEntry {
  presetId: string;
  displayName: string;
  presetUrl: string;
  splatUrl: string;
  splatFileSizeBytes?: number;
  enabledModes: MatchMode[];
  calibrationGroupId?: string;
  quality?: SplatQuality;
  defaultQuality: SplatQuality;
  qualities: Partial<Record<SplatQuality, SplatMapQualityEntry>>;
}

export interface SplatMapQualityEntry {
  presetId: string;
  presetUrl: string;
  splatUrl: string;
  splatFileSizeBytes?: number;
}

export interface SplatMapCatalog {
  defaultPresetId: string;
  maps: SplatMapEntry[];
}

export interface LoadConfiguredSplatArenaPresetOptions {
  strict?: boolean;
  playableOnly?: boolean;
}

export type SplatPresetSaveReason = 'autosave' | 'manual-save' | 'before-reset';

export interface SplatPresetHistoryEntry {
  reason: SplatPresetSaveReason;
  savedAt: string;
  preset: SplatArenaPreset;
}

export const SPLAT_CATALOG_URL = '/arena-presets/splat-catalog.json';
const ACTIVE_SPLAT_PRESET_KEY = 'magic-casters:active-splat-preset';
const ACTIVE_SPLAT_QUALITY_KEY = 'magic-casters:active-splat-quality';
const SPLAT_PRESET_SETTINGS_PREFIX = 'magic-casters:splat-preset:';
const SPLAT_PRESET_HISTORY_PREFIX = 'magic-casters:splat-preset-history:';
const SPLAT_PRESET_HISTORY_LIMIT = 5;

export async function loadSplatArenaPreset(url: string): Promise<SplatArenaPreset> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Arena preset failed: ${response.status}`);
  }
  return normalizeSplatArenaPreset(await response.json());
}

export async function loadSplatMapCatalog(url = SPLAT_CATALOG_URL): Promise<SplatMapCatalog> {
  const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Splat map catalog failed: ${response.status}`);
  }
  return normalizeSplatMapCatalog(await response.json());
}

export async function loadConfiguredSplatArenaPreset(
  presetId = getStoredSplatPresetId(),
  quality = getStoredSplatQuality(),
  options: LoadConfiguredSplatArenaPresetOptions = {}
): Promise<{ catalog: SplatMapCatalog; entry: SplatMapEntry; quality: SplatQuality; basePreset: SplatArenaPreset; preset: SplatArenaPreset }> {
  const catalog = await loadSplatMapCatalog();
  const entry = findSplatMapPoolEntry(catalog, presetId, options) as SplatMapEntry | null;
  if (!entry) {
    throw new Error('Splat map preset not found');
  }
  const variant = resolveSplatQualityEntry(entry, quality);
  const basePreset = await loadSplatArenaPreset(variant.presetUrl);
  const savedPreset = loadSavedSplatPreset(getSplatCalibrationStorageKey(basePreset));
  const preset = savedPreset ? mergeSavedPreset(basePreset, savedPreset) : basePreset;
  return { catalog, entry, quality: variant.quality, basePreset, preset };
}

export function saveConfiguredSplatArenaPreset(
  preset: SplatArenaPreset,
  reason: SplatPresetSaveReason = 'manual-save'
): SplatPresetHistoryEntry | null {
  try {
    const normalized = normalizeSplatArenaPreset(preset);
    localStorage.setItem(`${SPLAT_PRESET_SETTINGS_PREFIX}${getSplatCalibrationStorageKey(normalized)}`, JSON.stringify(normalized));
    setStoredSplatPresetId(getSplatCalibrationStorageKey(normalized));
    setStoredSplatQuality(normalized.quality ?? 'high');
    return pushSplatPresetHistory(normalized, reason);
  } catch (error) {
    console.warn('Unable to save splat preset', error);
    return null;
  }
}

export function clearConfiguredSplatArenaPreset(presetId: string): void {
  try {
    localStorage.removeItem(`${SPLAT_PRESET_SETTINGS_PREFIX}${presetId}`);
  } catch (error) {
    console.warn('Unable to clear splat preset', error);
  }
}

export function loadSplatPresetHistory(presetId: string): SplatPresetHistoryEntry[] {
  try {
    const raw = localStorage.getItem(`${SPLAT_PRESET_HISTORY_PREFIX}${presetId}`);
    if (!raw) return [];
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return [];
    return entries
      .map((entry) => normalizeHistoryEntry(entry))
      .filter((entry): entry is SplatPresetHistoryEntry => Boolean(entry))
      .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))
      .slice(0, SPLAT_PRESET_HISTORY_LIMIT);
  } catch (error) {
    console.warn('Unable to load splat preset history', error);
    return [];
  }
}

export function loadLatestSplatPresetHistoryEntry(presetId: string): SplatPresetHistoryEntry | null {
  return loadSplatPresetHistory(presetId)[0] ?? null;
}

export function loadLatestSplatPresetBackupEntry(presetId: string): SplatPresetHistoryEntry | null {
  return loadSplatPresetHistory(presetId).find((entry) => (
    entry.reason === 'before-reset' || entry.reason === 'manual-save'
  )) ?? null;
}

export function getStoredSplatPresetId(): string | undefined {
  try {
    return localStorage.getItem(ACTIVE_SPLAT_PRESET_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function setStoredSplatPresetId(presetId: string): void {
  try {
    localStorage.setItem(ACTIVE_SPLAT_PRESET_KEY, presetId);
  } catch (error) {
    console.warn('Unable to store active splat preset', error);
  }
}

export function getStoredSplatQuality(): SplatQuality | undefined {
  try {
    const quality = localStorage.getItem(ACTIVE_SPLAT_QUALITY_KEY);
    return quality === 'low' || quality === 'mid' || quality === 'high'
      ? quality
      : getDefaultSplatQuality();
  } catch {
    return getDefaultSplatQuality();
  }
}

export function setStoredSplatQuality(quality: SplatQuality): void {
  try {
    localStorage.setItem(ACTIVE_SPLAT_QUALITY_KEY, quality);
  } catch (error) {
    console.warn('Unable to store active splat quality', error);
  }
}

export function isPlayableSplatArenaPreset(
  preset: Pick<SplatArenaPreset, 'presetId' | 'calibrationGroupId'>
): boolean {
  return isPlayableSplatMapEntry({
    presetId: preset.presetId,
    calibrationGroupId: preset.calibrationGroupId,
    displayName: preset.presetId,
    presetUrl: '',
    splatUrl: '',
    enabledModes: []
  });
}

export function getSplatCalibrationStorageKey(preset: Pick<SplatArenaPreset, 'presetId' | 'calibrationGroupId'>): string {
  return preset.calibrationGroupId?.trim() || preset.presetId;
}

export function normalizeSplatArenaPreset(value: unknown): SplatArenaPreset {
  const data = asRecord(value);
  const arenaId = data.arenaId === 'splat-test' ? 'splat-test' : 'lightweight';
  if (arenaId !== 'splat-test' || data.type !== 'splat') {
    throw new Error('Preset is not a splat arena');
  }

  const legacySpawnPoints = asSpawnPoints(data.spawnPoints);
  const spawnSource = {
    spawnPoints: legacySpawnPoints,
    spawnPointsByMode: data.spawnPointsByMode
  };

  return {
    presetId: asString(data.presetId, 'splat-test'),
    presetVersion: asOptionalNumber(data.presetVersion),
    calibrationGroupId: asOptionalString(data.calibrationGroupId),
    quality: asOptionalSplatQuality(data.quality),
    arenaId,
    displayName: asString(data.displayName, 'Realistic Arena Test'),
    type: 'splat',
    splatUrl: assetUrl(requiredString(data.splatUrl, 'splatUrl')) ?? requiredString(data.splatUrl, 'splatUrl'),
    splatFileSizeBytes: asOptionalNumber(data.splatFileSizeBytes),
    enabledModes: resolveEnabledModes(data),
    collisionMeshUrl: assetUrl(asNullableString(data.collisionMeshUrl)),
    voxelCollisionUrl: assetUrl(asVoxelCollisionUrl(data.voxelCollisionUrl)),
    spawnPoints: resolveSpawnPointsForMode(spawnSource, '1v1'),
    spawnPointsByMode: spawnPointsByModeForPreset(spawnSource),
    bounds: asBounds(data.bounds),
    scale: asNumber(data.scale, 1),
    rotation: asVector(data.rotation),
    offset: asVector(data.offset),
    floorY: asNumber(data.floorY, 0),
    collisionErasers: normalizeCollisionErasers(data.collisionErasers),
    collisionWalls: clearAutoCollisionWalls(normalizeCollisionWalls(data.collisionWalls ?? data.invisibleWalls))
  };
}

function normalizeSplatMapCatalog(value: unknown): SplatMapCatalog {
  const data = asRecord(value);
  const maps = Array.isArray(data.maps)
    ? data.maps.map((entry) => normalizeSplatMapEntry(entry))
    : [];
  if (maps.length === 0) {
    throw new Error('Splat map catalog has no maps');
  }

  const defaultPresetId = asString(data.defaultPresetId, maps[0].presetId);
  return {
    defaultPresetId,
    maps
  };
}

function normalizeSplatMapEntry(value: unknown): SplatMapEntry {
  const data = asRecord(value);
  const presetId = requiredString(data.presetId, 'presetId');
  const explicitQuality = asOptionalSplatQuality(data.quality);
  const inferredQuality = explicitQuality ?? qualityFromPresetId(presetId);
  const defaultQuality = normalizeSplatQuality(data.defaultQuality ?? inferredQuality, 'high');
  const qualities = asSplatQualities(data.qualities);
  if (Object.keys(qualities).length === 0) {
    qualities[defaultQuality] = {
      presetId,
      presetUrl: requiredString(data.presetUrl, 'presetUrl'),
      splatUrl: assetUrl(requiredString(data.splatUrl, 'splatUrl')) ?? requiredString(data.splatUrl, 'splatUrl'),
      splatFileSizeBytes: asOptionalNumber(data.splatFileSizeBytes)
    };
  }
  return {
    presetId,
    displayName: asString(data.displayName, presetId),
    presetUrl: requiredString(data.presetUrl, 'presetUrl'),
    splatUrl: assetUrl(requiredString(data.splatUrl, 'splatUrl')) ?? requiredString(data.splatUrl, 'splatUrl'),
    splatFileSizeBytes: asOptionalNumber(data.splatFileSizeBytes),
    enabledModes: resolveEnabledModes(data),
    calibrationGroupId: asOptionalString(data.calibrationGroupId),
    quality: inferredQuality ?? undefined,
    defaultQuality,
    qualities
  };
}

export function loadSavedSplatPreset(presetId: string): SplatArenaPreset | null {
  try {
    const raw = localStorage.getItem(`${SPLAT_PRESET_SETTINGS_PREFIX}${presetId}`);
    return raw ? normalizeSplatArenaPreset(JSON.parse(raw)) : null;
  } catch (error) {
    console.warn('Unable to load saved splat preset', error);
    return null;
  }
}

function pushSplatPresetHistory(preset: SplatArenaPreset, reason: SplatPresetSaveReason): SplatPresetHistoryEntry {
  const entry: SplatPresetHistoryEntry = {
    reason,
    savedAt: new Date().toISOString(),
    preset
  };
  const history = loadSplatPresetHistory(getSplatCalibrationStorageKey(preset));
  const nextHistory = [entry, ...history].slice(0, SPLAT_PRESET_HISTORY_LIMIT);
  localStorage.setItem(`${SPLAT_PRESET_HISTORY_PREFIX}${getSplatCalibrationStorageKey(preset)}`, JSON.stringify(nextHistory));
  return entry;
}

function normalizeHistoryEntry(value: unknown): SplatPresetHistoryEntry | null {
  try {
    const data = asRecord(value);
    const reason = normalizeSaveReason(data.reason);
    const savedAt = typeof data.savedAt === 'string' && !Number.isNaN(Date.parse(data.savedAt))
      ? data.savedAt
      : new Date(0).toISOString();
    return {
      reason,
      savedAt,
      preset: normalizeSplatArenaPreset(data.preset)
    };
  } catch {
    return null;
  }
}

function normalizeSaveReason(value: unknown): SplatPresetSaveReason {
  return value === 'autosave' || value === 'before-reset' || value === 'manual-save'
    ? value
    : 'autosave';
}

function mergeSavedPreset(basePreset: SplatArenaPreset, savedPreset: SplatArenaPreset): SplatArenaPreset {
  return mergeSplatArenaPresetForRuntime(basePreset, savedPreset);
}

export function mergeSplatArenaPresetForRuntime(basePreset: SplatArenaPreset, savedPreset: SplatArenaPreset): SplatArenaPreset {
  if (!splatPresetIsCompatibleWithBase(basePreset, savedPreset)) {
    return clonePreset(basePreset);
  }

  return {
    ...basePreset,
    scale: savedPreset.scale,
    rotation: { ...savedPreset.rotation },
    offset: { ...savedPreset.offset },
    floorY: savedPreset.floorY,
    bounds: { ...savedPreset.bounds },
    spawnPoints: savedPreset.spawnPoints.map((spawn) => ({ ...spawn })),
    spawnPointsByMode: cloneSpawnPointsByMode(savedPreset.spawnPointsByMode),
    enabledModes: [...savedPreset.enabledModes],
    collisionMeshUrl: basePreset.collisionMeshUrl ?? savedPreset.collisionMeshUrl,
    voxelCollisionUrl: basePreset.voxelCollisionUrl ?? savedPreset.voxelCollisionUrl,
    collisionErasers: savedPreset.collisionErasers.map((eraser) => ({ ...eraser })),
    collisionWalls: savedPreset.collisionWalls.map((wall) => ({ ...wall }))
  };
}

export function splatPresetIsCompatibleWithBase(basePreset: SplatArenaPreset, savedPreset: SplatArenaPreset): boolean {
  if (getSplatCalibrationStorageKey(basePreset) !== getSplatCalibrationStorageKey(savedPreset)) return false;
  if (basePreset.presetVersion === undefined) return true;
  return savedPreset.presetVersion === basePreset.presetVersion;
}

function clonePreset(preset: SplatArenaPreset): SplatArenaPreset {
  return {
    ...preset,
    rotation: { ...preset.rotation },
    offset: { ...preset.offset },
    bounds: { ...preset.bounds },
    spawnPoints: preset.spawnPoints.map((spawn) => ({ ...spawn })),
    spawnPointsByMode: cloneSpawnPointsByMode(preset.spawnPointsByMode),
    enabledModes: [...preset.enabledModes],
    collisionErasers: preset.collisionErasers.map((eraser) => ({ ...eraser })),
    collisionWalls: preset.collisionWalls.map((wall) => ({ ...wall }))
  };
}

export function calibrationSettingsFromPreset(preset: SplatArenaPreset): SplatCalibrationSettings {
  return {
    scale: preset.scale,
    rotation: { ...preset.rotation },
    offset: { ...preset.offset },
    floorY: preset.floorY,
    bounds: { ...preset.bounds },
    spawnPoints: preset.spawnPoints.map((spawn) => ({ ...spawn })),
    spawnPointsByMode: cloneSpawnPointsByMode(preset.spawnPointsByMode),
    enabledModes: [...preset.enabledModes],
    collisionErasers: preset.collisionErasers.map((eraser) => ({ ...eraser })),
    collisionWalls: preset.collisionWalls.map((wall) => ({ ...wall }))
  };
}

export function applyCalibrationToPreset(
  preset: SplatArenaPreset,
  settings: SplatCalibrationSettings
): SplatArenaPreset {
  return {
    ...preset,
    scale: settings.scale,
    rotation: { ...settings.rotation },
    offset: { ...settings.offset },
    floorY: settings.floorY,
    bounds: { ...settings.bounds },
    enabledModes: [...settings.enabledModes],
    spawnPoints: resolveSpawnPointsForMode(settings, '1v1'),
    spawnPointsByMode: cloneSpawnPointsByMode(settings.spawnPointsByMode),
    collisionErasers: settings.collisionErasers.map((eraser) => ({ ...eraser })),
    collisionWalls: settings.collisionWalls.map((wall) => ({ ...wall }))
  };
}

export function collisionConfigFromPreset(preset: SplatArenaPreset): ArenaCollisionConfig {
  return {
    bounds: { ...preset.bounds },
    floorY: preset.floorY,
    spawnPoints: resolveSpawnPointsForMode(preset, '1v1'),
    voxelCollisionUrl: preset.voxelCollisionUrl,
    collisionErasers: preset.collisionErasers.map((eraser) => ({ ...eraser })),
    collisionWalls: preset.collisionWalls.map((wall) => ({ ...wall }))
  };
}

export function collisionConfigFromPresetForMode(preset: SplatArenaPreset, mode: MatchMode): ArenaCollisionConfig {
  return {
    bounds: { ...preset.bounds },
    floorY: preset.floorY,
    spawnPoints: resolveSpawnPointsForMode(preset, mode),
    voxelCollisionUrl: preset.voxelCollisionUrl,
    collisionErasers: preset.collisionErasers.map((eraser) => ({ ...eraser })),
    collisionWalls: preset.collisionWalls.map((wall) => ({ ...wall }))
  };
}

function cloneSpawnPointsByMode(
  value: Partial<Record<MatchMode, ArenaSpawnPoint[]>>
): Partial<Record<MatchMode, ArenaSpawnPoint[]>> {
  return {
    '1v1': value['1v1']?.map((spawn) => ({ ...spawn })),
    '2v2': value['2v2']?.map((spawn) => ({ ...spawn }))
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Preset JSON must be an object');
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Preset missing ${name}`);
  }
  return value;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asOptionalSplatQuality(value: unknown): SplatQuality | undefined {
  return value === 'low' || value === 'mid' || value === 'high' ? value : undefined;
}

function asSplatQualities(value: unknown): Partial<Record<SplatQuality, SplatMapQualityEntry>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const data = value as Record<string, unknown>;
  const qualities: Partial<Record<SplatQuality, SplatMapQualityEntry>> = {};
  for (const quality of ['low', 'mid', 'high'] as const) {
    const entry = data[quality];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const presetId = record.presetId;
    const presetUrl = record.presetUrl;
    const splatUrl = record.splatUrl;
    if (typeof presetId !== 'string' || typeof presetUrl !== 'string' || typeof splatUrl !== 'string') continue;
    qualities[quality] = {
      presetId,
      presetUrl,
      splatUrl: assetUrl(splatUrl) ?? splatUrl,
      splatFileSizeBytes: asOptionalNumber(record.splatFileSizeBytes)
    };
  }
  return qualities;
}

function qualityFromPresetId(presetId: string): SplatQuality | undefined {
  const match = presetId.match(/-(low|mid|high)$/i);
  return match ? match[1].toLowerCase() as SplatQuality : undefined;
}

function asVoxelCollisionUrl(value: unknown): string | null {
  const url = asNullableString(value);
  if (!url) return null;
  try {
    const pathname = new URL(url, 'http://localhost').pathname;
    return pathname.startsWith('/collision/') && pathname.endsWith('.voxel.json') ? url : null;
  } catch {
    return null;
  }
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asVector(value: unknown): ArenaVector {
  const data = asRecord(value ?? {});
  return {
    x: asNumber(data.x, 0),
    y: asNumber(data.y, 0),
    z: asNumber(data.z, 0)
  };
}

function asBounds(value: unknown): ArenaBounds {
  const data = asRecord(value ?? {});
  return {
    minX: asNumber(data.minX, -8),
    maxX: asNumber(data.maxX, 8),
    minZ: asNumber(data.minZ, -6),
    maxZ: asNumber(data.maxZ, 6)
  };
}

function asSpawnPoints(value: unknown): ArenaSpawnPoint[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [
      { x: -5.5, y: 0, z: 0, rotY: -Math.PI / 2 },
      { x: 5.5, y: 0, z: 0, rotY: Math.PI / 2 }
    ];
  }

  return value.map((entry) => {
    const data = asRecord(entry);
    return {
      x: asNumber(data.x, 0),
      y: asNumber(data.y, 0),
      z: asNumber(data.z, 0),
      rotY: asNumber(data.rotY, 0)
    };
  });
}
