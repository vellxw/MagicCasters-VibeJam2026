import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, normalize, resolve, sep } from 'node:path';
import { createVoxelCollisionFromData, type SparseVoxelCollision, type VoxelMetadata } from '../../../shared/voxelCollision.js';

const cache = new Map<string, SparseVoxelCollision | null>();
const syncCache = new Map<string, SparseVoxelCollision | null>();

export async function loadServerVoxelCollision(url: string | null | undefined, root = process.cwd()): Promise<SparseVoxelCollision | null> {
  const safeUrl = normalizeVoxelCollisionUrl(url);
  if (!safeUrl) return null;
  if (cache.has(safeUrl)) return cache.get(safeUrl) ?? null;

  try {
    const jsonPath = findVoxelJsonPath(root, safeUrl);
    if (!jsonPath) {
      return null;
    }

    const metadata = JSON.parse(await readFile(jsonPath, 'utf8')) as VoxelMetadata;
    const binPath = jsonPath.replace(/\.voxel\.json$/i, '.voxel.bin');
    if (binPath === jsonPath || !existsSync(binPath)) {
      return null;
    }

    const buffer = await readFile(binPath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const collision = createVoxelCollisionFromData(metadata, arrayBuffer);
    cache.set(safeUrl, collision);
    return collision;
  } catch (error) {
    console.warn(`[server] Voxel collision unavailable for ${safeUrl}:`, error);
    return null;
  }
}

export function loadServerVoxelCollisionSync(url: string | null | undefined, root = process.cwd()): SparseVoxelCollision | null {
  const safeUrl = normalizeVoxelCollisionUrl(url);
  if (!safeUrl) return null;
  if (syncCache.has(safeUrl)) return syncCache.get(safeUrl) ?? null;

  try {
    const jsonPath = findVoxelJsonPath(root, safeUrl);
    if (!jsonPath) {
      return null;
    }

    const metadata = JSON.parse(readFileSync(jsonPath, 'utf8')) as VoxelMetadata;
    const binPath = jsonPath.replace(/\.voxel\.json$/i, '.voxel.bin');
    if (binPath === jsonPath || !existsSync(binPath)) {
      return null;
    }

    const buffer = readFileSync(binPath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const collision = createVoxelCollisionFromData(metadata, arrayBuffer);
    syncCache.set(safeUrl, collision);
    return collision;
  } catch (error) {
    console.warn(`[server] Voxel collision unavailable for ${safeUrl}:`, error);
    return null;
  }
}

export function invalidateServerVoxelCollision(url: string | null | undefined): void {
  const safeUrl = normalizeVoxelCollisionUrl(url);
  if (!safeUrl) return;
  cache.delete(safeUrl);
  syncCache.delete(safeUrl);
}

function findVoxelJsonPath(root: string, url: string): string | null {
  const filename = basename(url);
  for (const base of [
    resolve(root, 'client', 'public', 'collision'),
    resolve(root, 'client', 'dist', 'collision')
  ]) {
    const path = resolveUnder(base, filename);
    if (path && existsSync(path)) return path;
  }
  return null;
}

function normalizeVoxelCollisionUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  return trimmed.startsWith('/collision/') && trimmed.endsWith('.voxel.json') && !trimmed.includes('..')
    ? trimmed
    : null;
}

function resolveUnder(base: string, filename: string): string | null {
  const candidate = resolve(base, filename);
  const normalizedBase = normalize(base + sep);
  return dirname(candidate) === normalize(base) && candidate.startsWith(normalizedBase)
    ? candidate
    : null;
}
