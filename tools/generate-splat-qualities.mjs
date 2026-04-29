#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(repoRoot, 'client', 'public', 'arena-presets', 'splat-catalog.json');

if (!existsSync(catalogPath)) {
  fail(`Catalog not found: ${relative(catalogPath)}`);
}

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const maps = Array.isArray(catalog.maps) ? catalog.maps : [];
if (maps.length === 0) {
  fail('Catalog has no maps.');
}

let missing = 0;
for (const map of maps) {
  const label = stringField(map.displayName, map.presetId ?? 'unknown map');
  const qualities = map.qualities && typeof map.qualities === 'object' ? map.qualities : {};
  for (const quality of ['low', 'mid', 'high']) {
    const entry = qualities[quality];
    if (!entry) {
      console.warn(`[missing] ${label}: qualities.${quality}`);
      missing++;
      continue;
    }
    checkAsset(label, quality, entry.presetUrl, 'client/public');
    checkAsset(label, quality, entry.splatUrl, 'client/public');
    checkPresetCollisionAssets(label, quality, entry.presetUrl);
  }
}

if (missing > 0) {
  fail(`Catalog is missing ${missing} quality entries.`);
}

console.log(`Splat quality catalog OK: ${maps.length} map groups.`);

function checkAsset(label, quality, url, publicRoot) {
  const pathname = assetPathname(url);
  if (!pathname) {
    console.warn(`[missing] ${label} ${quality}: invalid asset URL ${String(url)}`);
    missing++;
    return;
  }
  const filePath = path.join(repoRoot, publicRoot, pathname);
  if (!existsSync(filePath)) {
    console.warn(`[missing] ${label} ${quality}: ${relative(filePath)}`);
    missing++;
  }
}

function checkPresetCollisionAssets(label, quality, presetUrl) {
  const pathname = assetPathname(presetUrl);
  if (!pathname) return;
  const filePath = path.join(repoRoot, 'client', 'public', pathname);
  if (!existsSync(filePath)) return;

  const preset = JSON.parse(readFileSync(filePath, 'utf8'));
  if (preset.collisionMeshUrl) {
    checkAsset(label, quality, preset.collisionMeshUrl, 'client/public');
  }
  if (preset.voxelCollisionUrl) {
    checkAsset(label, quality, preset.voxelCollisionUrl, 'client/public');
    checkAsset(label, quality, String(preset.voxelCollisionUrl).replace(/\.voxel\.json$/i, '.voxel.bin'), 'client/public');
  }
}

function assetPathname(url) {
  if (typeof url !== 'string' || !url.startsWith('/')) return null;
  return url.replace(/^\/+/, '').replaceAll('/', path.sep);
}

function stringField(value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, '/');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
