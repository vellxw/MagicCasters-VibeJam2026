import { existsSync, readFileSync } from 'node:fs';
import { basename, normalize, resolve, sep } from 'node:path';
import { normalizeArenaCollisionConfig } from '../../../shared/arenaCollision.js';
import {
  compactSplatMapCatalog,
  findSplatMapEntry,
  isPlayableSplatMapEntry,
  resolveSplatQualityEntry,
  selectRandomSplatMapForMode,
  resolveSpawnPointsForMode,
  type SplatMapQualityEntry,
  type SplatMapPoolCatalog,
  type SplatMapPoolEntry
} from '../../../shared/splatMapPool.js';
import type { ArenaCollisionConfig, MatchMode } from '../../../shared/types.js';
import { loadServerVoxelCollisionSync } from './ServerVoxelCollision.js';

export interface PublishedSplatArenaSelection {
  presetId: string;
  displayName: string;
  presetUrl: string;
  collision: ArenaCollisionConfig;
}

export function selectPublishedSplatArenaForMode(
  mode: MatchMode,
  root = process.cwd(),
  random: () => number = Math.random
): PublishedSplatArenaSelection | null {
  const catalog = readPublishedSplatCatalog(root);
  if (!catalog) return null;

  const candidates = playablePublishedMaps(catalog);
  while (candidates.length > 0) {
    const selected = selectRandomSplatMapForMode({ ...catalog, maps: candidates }, mode, random);
    if (!selected) return null;
    const selectedVariant = resolveSplatQualityEntry(selected);

    const preset = readPublishedSplatPreset(root, selectedVariant);
    if (preset) {
      const collision = stabilizedCollisionConfigFromPublishedPreset(preset, mode, root);
      if (!collision) {
        const index = candidates.findIndex((entry) => entry.presetId === selected.presetId);
        if (index >= 0) candidates.splice(index, 1);
        else break;
        continue;
      }
      return {
        presetId: stringField(preset.presetId, selected.presetId),
        displayName: stripQualityLabel(selected.displayName || stringField(preset.displayName, selected.displayName)),
        presetUrl: selectedVariant.presetUrl,
        collision
      };
    }

    const index = candidates.findIndex((entry) => entry.presetId === selected.presetId);
    if (index >= 0) candidates.splice(index, 1);
    else break;
  }

  return null;
}

export function selectPublishedSplatArenaByPresetId(
  presetId: string,
  mode: MatchMode,
  root = process.cwd()
): PublishedSplatArenaSelection | null {
  const catalog = readPublishedSplatCatalog(root);
  if (!catalog) return null;
  const selected = findSplatMapEntry(catalog, presetId, { strict: true, playableOnly: true });
  if (!selected) return null;

  const selectedVariant = resolveSplatQualityEntry(selected);
  const preset = readPublishedSplatPreset(root, selectedVariant);
  if (!preset) return null;
  const collision = stabilizedCollisionConfigFromPublishedPreset(preset, mode, root);
  if (!collision) return null;

  return {
    presetId: stringField(preset.presetId, selectedVariant.presetId),
    displayName: stripQualityLabel(selected.displayName || stringField(preset.displayName, selected.displayName)),
    presetUrl: selectedVariant.presetUrl,
    collision
  };
}

function readPublishedSplatCatalog(root: string): SplatMapPoolCatalog | null {
  const path = findArenaPresetAsset(root, 'splat-catalog.json');
  if (!path) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as SplatMapPoolCatalog;
    return {
      defaultPresetId: typeof parsed.defaultPresetId === 'string' ? parsed.defaultPresetId : undefined,
      maps: Array.isArray(parsed.maps) ? parsed.maps : []
    };
  } catch (error) {
    console.warn('[server] Splat catalog unavailable:', error);
    return null;
  }
}

function readPublishedSplatPreset(root: string, entry: Pick<SplatMapPoolEntry | SplatMapQualityEntry, 'presetId' | 'presetUrl'>): Record<string, unknown> | null {
  const filename = basename(entry.presetUrl);
  if (!filename.endsWith('.json') || filename.includes('..')) return null;
  const path = findArenaPresetAsset(root, filename);
  if (!path) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch (error) {
    console.warn(`[server] Splat preset unavailable for ${entry.presetId}:`, error);
    return null;
  }
}

function playablePublishedMaps(catalog: SplatMapPoolCatalog): SplatMapPoolEntry[] {
  return compactSplatMapCatalog(catalog, {
    includeUnassigned: true
  }).filter(isPlayableSplatMapEntry);
}

function collisionConfigFromPublishedPreset(preset: Record<string, unknown>, mode: MatchMode): ArenaCollisionConfig {
  return normalizeArenaCollisionConfig({
    bounds: preset.bounds,
    floorY: preset.floorY,
    spawnPoints: resolveSpawnPointsForMode(preset, mode),
    voxelCollisionUrl: preset.voxelCollisionUrl,
    collisionErasers: preset.collisionErasers,
    collisionWalls: preset.collisionWalls
  });
}

function stabilizedCollisionConfigFromPublishedPreset(
  preset: Record<string, unknown>,
  mode: MatchMode,
  root: string
): ArenaCollisionConfig | null {
  const collision = collisionConfigFromPublishedPreset(preset, mode);
  if (collision.voxelCollisionUrl && !loadServerVoxelCollisionSync(collision.voxelCollisionUrl, root)) {
    return null;
  }
  return collision;
}

function findArenaPresetAsset(root: string, filename: string): string | null {
  for (const base of [
    resolve(root, 'client', 'public', 'arena-presets'),
    resolve(root, 'client', 'dist', 'arena-presets')
  ]) {
    const path = resolveUnder(base, filename);
    if (path && existsSync(path)) return path;
  }
  return null;
}

function resolveUnder(base: string, filename: string): string | null {
  const candidate = resolve(base, filename);
  const normalizedBase = normalize(base + sep);
  return candidate.startsWith(normalizedBase) ? candidate : null;
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function stripQualityLabel(value: string): string {
  return value.replace(/\s*\((LOW|MID|HIGH)\)\s*$/i, '').trim();
}
