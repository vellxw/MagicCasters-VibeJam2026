import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, extname, join, normalize, resolve, sep } from 'node:path';
import {
  resolveEnabledModes,
  resolveSpawnPointsForMode,
  type SplatMapPoolCatalog
} from '../../../shared/splatMapPool.js';
import { applyDevAccessCorsHeaders, defaultDevAccessState, isDevAccessConfigured, isDevAccessRequestAllowed, isProductionLike, isRemoteDevAccessEnabled, requireDevAccessToken, type DevAccessState } from './devAccessAuth.js';
import { invalidateServerVoxelCollision } from '../systems/ServerVoxelCollision.js';

const API_PREFIX = '/api/dev/splat-collision/';
const MAP_API_PREFIX = '/api/dev/splat-map/';
const VFX_MAP_API_PREFIX = '/api/dev/vfx-map/';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 24 * 1024;
const GENERATE_TIMEOUT_MS = 5 * 60 * 1000;
const LARGE_GENERATE_TIMEOUT_MS = 15 * 60 * 1000;
const LARGE_SPLAT_THRESHOLD_BYTES = 80 * 1024 * 1024;

export interface SplatCollisionDevRequest {
  arenaId: string;
  splatFilename: string;
  collisionMeshUrl: string;
  voxelCollisionUrl: string;
  playableFilterBox: string | null;
}

interface CollisionPresetUrls {
  collisionMeshUrl: string | null;
  voxelCollisionUrl: string | null;
}

interface ClientAssetRoot {
  absolute: string;
  relative: 'client/public' | 'client/dist';
}

interface SplatCollisionDevStatus {
  ok: true;
  enabled: boolean;
  localOnly: boolean;
  remoteEnabled: boolean;
  production: boolean;
  message?: string;
}

let activeGeneration = false;

export function handleSplatCollisionDevApi(
  request: IncomingMessage,
  response: ServerResponse,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  devAccessState: DevAccessState = defaultDevAccessState
): boolean {
  const pathname = safeApiPathname(request.url);
  if (!pathname.startsWith(API_PREFIX) && !pathname.startsWith(MAP_API_PREFIX) && !pathname.startsWith(VFX_MAP_API_PREFIX)) return false;

  applyDevAccessCorsHeaders(response, env, request.headers.origin, request.headers.host, request.socket.remoteAddress);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return true;
  }

  if (request.method === 'GET' && (pathname === `${API_PREFIX}status` || pathname === `${MAP_API_PREFIX}status` || pathname === `${VFX_MAP_API_PREFIX}status`)) {
    sendJson(response, 200, getSplatCollisionDevStatus(env, request.headers.host, request.socket.remoteAddress));
    return true;
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, { ok: false, error: 'Method not allowed' });
    return true;
  }

  if (!isLocalDevSplatCollisionRequestAllowed(env, request.headers.host, request.socket.remoteAddress)) {
    sendJson(response, 403, {
      ok: false,
      error: devApiDisabledMessage(env),
      command: 'npm run splat:collision -- --input client/public/splats/<arena>.sog --arena <arena-id>'
    });
    return true;
  }

  const auth = isDevPostRequestAuthorized(env, request.headers.authorization, request.headers.host, request.socket.remoteAddress, devAccessState);
  if (!auth.ok) {
    sendJson(response, auth.status, { ok: false, error: auth.error });
    return true;
  }

  void readJsonBody(request)
    .then((body) => (
      pathname.startsWith(VFX_MAP_API_PREFIX)
        ? routeVfxMapRequest(pathname, body, response)
        : pathname.startsWith(MAP_API_PREFIX)
          ? routeSplatMapRequest(pathname, body, response)
          : routeSplatCollisionRequest(pathname, body, response)
    ))
    .catch((error) => sendJson(response, 400, { ok: false, error: errorMessage(error) }));
  return true;
}

export function isDevPostRequestAuthorized(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  authorization: string | undefined,
  host: string | undefined,
  remoteAddress: string | undefined,
  devAccessState: DevAccessState = defaultDevAccessState
): { ok: true } | { ok: false; status: number; error: string } {
  return requireDevAccessToken(env, devAccessState, authorization, host, remoteAddress);
}

export function isLocalDevSplatCollisionRequestAllowed(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  host: string | undefined,
  remoteAddress: string | undefined
): boolean {
  if (env.DISABLE_SPLAT_COLLISION_API === '1') {
    return false;
  }
  if (isProductionLike(env) && isRemoteDevAccessEnabled(env) && !isDevAccessConfigured(env)) {
    return false;
  }
  return isDevAccessRequestAllowed(env, host, remoteAddress);
}

export function normalizeSplatCollisionDevRequest(body: unknown): SplatCollisionDevRequest {
  const data = asRecord(body);
  const splatUrl = requiredString(data.splatUrl, 'splatUrl');
  const pathname = safeDecodedPathname(splatUrl);
  if (!pathname.startsWith('/splats/') || extname(pathname).toLowerCase() !== '.sog') {
    throw new Error('splatUrl must point to a /splats/*.sog asset');
  }

  const splatFilename = basename(pathname);
  const rawArenaId = typeof data.arenaId === 'string' ? data.arenaId : splatFilename.slice(0, -4);
  const arenaId = sanitizeArenaId(rawArenaId);
  return {
    arenaId,
    splatFilename,
    collisionMeshUrl: `/collision/${arenaId}.collision.glb`,
    voxelCollisionUrl: `/collision/${arenaId}.voxel.json`,
    playableFilterBox: asFilterBox(data.playableFilterBox)
  };
}

async function routeSplatCollisionRequest(pathname: string, body: unknown, response: ServerResponse): Promise<void> {
  if (pathname === `${API_PREFIX}generate`) {
    await generateSplatCollision(body, response);
    return;
  }
  if (pathname === `${API_PREFIX}delete`) {
    await deleteSplatCollision(body, response);
    return;
  }
  sendJson(response, 404, { ok: false, error: 'Unknown splat collision dev endpoint' });
}

async function routeSplatMapRequest(pathname: string, body: unknown, response: ServerResponse): Promise<void> {
  if (pathname === `${MAP_API_PREFIX}publish`) {
    const repoRoot = findRepoRoot();
    const preset = asRecord(body).preset ?? body;
    const updatedPresets = await persistArenaPresetToProject(repoRoot, preset);
    sendJson(response, 200, { ok: true, updatedPresets });
    return;
  }
  sendJson(response, 404, { ok: false, error: 'Unknown splat map dev endpoint' });
}

async function routeVfxMapRequest(pathname: string, body: unknown, response: ServerResponse): Promise<void> {
  if (pathname === `${VFX_MAP_API_PREFIX}publish`) {
    const repoRoot = findRepoRoot();
    const config = normalizeVfxMapConfig(body);
    const presetId = sanitizeArenaId(config.presetId);
    const assetRoot = writableClientAssetRoot(repoRoot);
    const vfxDir = resolve(assetRoot.absolute, 'vfx', 'maps');
    await mkdir(vfxDir, { recursive: true });
    const configPath = resolveUnderBase(vfxDir, `${presetId}-vfx.json`);
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

    await mirrorClientAssetFilesToDist(repoRoot, assetRoot, [`vfx/maps/${presetId}-vfx.json`]);

    sendJson(response, 200, { ok: true, presetId, file: `vfx/maps/${presetId}-vfx.json` });
    return;
  }
  sendJson(response, 404, { ok: false, error: 'Unknown VFX map dev endpoint' });
}

function normalizeVfxMapConfig(value: unknown): { presetId: string; effects: Array<{ id: string; vfxId: string; position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: number }> } {
  const data = asRecord(value);
  const presetId = typeof data.presetId === 'string' ? data.presetId : 'lobby-high';
  const rawEffects = Array.isArray(data.effects) ? data.effects : [];
  const effects = rawEffects.map((entry: unknown) => {
    const e = asRecord(entry);
    return {
      id: typeof e.id === 'string' ? e.id : `vfx_${Date.now()}`,
      vfxId: typeof e.vfxId === 'string' ? e.vfxId : 'portal_electric',
      position: normalizeVec3(e.position),
      rotation: normalizeVec3(e.rotation),
      scale: typeof e.scale === 'number' && Number.isFinite(e.scale) ? e.scale : 1
    };
  });
  return { presetId, effects };
}

function normalizeVec3(value: unknown): { x: number; y: number; z: number } {
  const v = asRecord(value);
  return {
    x: typeof v.x === 'number' && Number.isFinite(v.x) ? v.x : 0,
    y: typeof v.y === 'number' && Number.isFinite(v.y) ? v.y : 0,
    z: typeof v.z === 'number' && Number.isFinite(v.z) ? v.z : 0
  };
}

export function getSplatCollisionDevStatus(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  host: string | undefined,
  remoteAddress: string | undefined
): SplatCollisionDevStatus {
  const production = isProductionLike(env);
  const enabled = isLocalDevSplatCollisionRequestAllowed(env, host, remoteAddress);
  const remoteEnabled = production && isRemoteDevAccessEnabled(env) && isDevAccessConfigured(env);
  return {
    ok: true,
    enabled,
    localOnly: !production,
    remoteEnabled,
    production,
    message: enabled ? undefined : devApiDisabledMessage(env)
  };
}

function devApiDisabledMessage(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string {
  if (env.DISABLE_SPLAT_COLLISION_API === '1') {
    return 'Map editing API is disabled by DISABLE_SPLAT_COLLISION_API.';
  }
  if (isProductionLike(env)) {
    if (!isRemoteDevAccessEnabled(env)) {
      return 'Remote map editing is not enabled. Set DEV_ACCESS_REMOTE_ENABLED=1.';
    }
    if (!isDevAccessConfigured(env)) {
      return 'Remote map editing password verifier is not configured.';
    }
  }
  return 'Map editing API is only available from local dev or an enabled remote server.';
}

async function generateSplatCollision(body: unknown, response: ServerResponse): Promise<void> {
  if (activeGeneration) {
    sendJson(response, 409, { ok: false, error: 'A splat collision generation is already running.' });
    return;
  }

  const request = normalizeSplatCollisionDevRequest(body);
  const repoRoot = findRepoRoot();
  const assetRoot = writableClientAssetRoot(repoRoot);
  const splatPath = resolveUnderBase(resolve(assetRoot.absolute, 'splats'), request.splatFilename);
  const collisionDir = resolve(assetRoot.absolute, 'collision');
  const glbPath = resolveUnderBase(collisionDir, `${request.arenaId}.collision.glb`);
  const voxelJsonPath = resolveUnderBase(collisionDir, `${request.arenaId}.voxel.json`);
  const voxelBinPath = resolveUnderBase(collisionDir, `${request.arenaId}.voxel.bin`);

  if (!existsSync(splatPath)) {
    sendJson(response, 404, { ok: false, error: `SOG not found: ${assetRoot.relative}/splats/${request.splatFilename}` });
    return;
  }

  mkdirSync(collisionDir, { recursive: true });
  const splatSizeBytes = statSync(splatPath).size;
  const largeMode = splatSizeBytes >= LARGE_SPLAT_THRESHOLD_BYTES;
  const command = collisionCommandForRequest(request, largeMode, assetRoot);
  if (existsSync(glbPath) && existsSync(voxelJsonPath) && existsSync(voxelBinPath)) {
    await writeGeneratedCollisionMarker(repoRoot, assetRoot, request);
    await mirrorGeneratedCollisionToDist(repoRoot, assetRoot, request.arenaId);
    const updatedPresets = await persistCollisionUrlsToPresetFiles(repoRoot, request);
    sendJson(response, 200, {
      ok: true,
      collisionMeshUrl: request.collisionMeshUrl,
      voxelCollisionUrl: request.voxelCollisionUrl,
      arenaId: request.arenaId,
      updatedPresets,
      command,
      output: 'Existing voxel collision files activated and saved to matching arena presets.'
    });
    return;
  }

  activeGeneration = true;
  try {
    const result = await runCollisionScript(repoRoot, assetRoot, request.splatFilename, request.arenaId, {
      largeMode,
      filterBox: request.playableFilterBox
    });
    const generatedOk = result.exitCode === 0 && existsSync(glbPath) && existsSync(voxelJsonPath) && existsSync(voxelBinPath);
    let updatedPresets: string[] = [];
    if (generatedOk) {
      await writeGeneratedCollisionMarker(repoRoot, assetRoot, request);
      await mirrorGeneratedCollisionToDist(repoRoot, assetRoot, request.arenaId);
      updatedPresets = await persistCollisionUrlsToPresetFiles(repoRoot, request);
    }
    sendJson(response, generatedOk ? 200 : 500, {
      ok: generatedOk,
      collisionMeshUrl: request.collisionMeshUrl,
      voxelCollisionUrl: request.voxelCollisionUrl,
      arenaId: request.arenaId,
      updatedPresets,
      command,
      output: result.output,
      error: generatedOk
        ? undefined
        : result.exitCode === 0
          ? 'splat-transform did not write the expected voxel collision files'
          : formatCollisionScriptError(result, largeMode)
    });
  } finally {
    activeGeneration = false;
  }
}

async function deleteSplatCollision(body: unknown, response: ServerResponse): Promise<void> {
  const request = normalizeSplatCollisionDevRequest(body);
  const repoRoot = findRepoRoot();
  const assetRoot = writableClientAssetRoot(repoRoot);
  const collisionDir = resolve(assetRoot.absolute, 'collision');
  const markerPath = resolveUnderBase(collisionDir, `${request.arenaId}.generated.json`);
  const candidates = existsSync(markerPath) ? [
    `${request.arenaId}.collision.glb`,
    `${request.arenaId}.voxel.json`,
    `${request.arenaId}.voxel.bin`,
    `${request.arenaId}.generated.json`
  ] : [];
  const deleted: string[] = [];

  for (const filename of candidates) {
    const path = resolveUnderBase(collisionDir, filename);
    if (!existsSync(path)) continue;
    await unlink(path);
    deleted.push(path.slice(collisionDir.length + 1).replaceAll('\\', '/'));
  }
  if (assetRoot.relative !== 'client/dist') {
    for (const filename of candidates) {
      const path = resolveUnder(repoRoot, join('client', 'dist', 'collision'), filename);
      if (!existsSync(path)) continue;
      await unlink(path);
      deleted.push(`dist/${filename}`);
    }
  }
  const updatedPresets = await persistCollisionUrlsToPresetFiles(repoRoot, request, {
    collisionMeshUrl: null,
    voxelCollisionUrl: null
  });

  sendJson(response, 200, {
    ok: true,
    arenaId: request.arenaId,
    collisionMeshUrl: request.collisionMeshUrl,
    voxelCollisionUrl: request.voxelCollisionUrl,
    deleted,
    updatedPresets
  });
}

export async function persistCollisionUrlsToPresetFiles(
  repoRoot: string,
  request: SplatCollisionDevRequest,
  urls: CollisionPresetUrls = {
    collisionMeshUrl: request.collisionMeshUrl,
    voxelCollisionUrl: request.voxelCollisionUrl
  }
): Promise<string[]> {
  const assetRoot = writableClientAssetRoot(repoRoot);
  const presetDir = resolve(assetRoot.absolute, 'arena-presets');
  if (!existsSync(presetDir)) return [];

  const splatUrl = `/splats/${request.splatFilename}`;
  const updated: string[] = [];
  const entries = await readdir(presetDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'splat-catalog.json') continue;

    const presetPath = resolveUnderBase(presetDir, entry.name);
    let preset: unknown;
    try {
      preset = JSON.parse(await readFile(presetPath, 'utf8')) as unknown;
    } catch {
      continue;
    }
    if (!isJsonRecord(preset)) continue;

    const matchesPresetId = preset.presetId === request.arenaId || preset.arenaId === request.arenaId;
    const matchesSplat = preset.splatUrl === splatUrl;
    if (!matchesPresetId && !matchesSplat) continue;

    preset.collisionMeshUrl = urls.collisionMeshUrl;
    preset.voxelCollisionUrl = urls.voxelCollisionUrl;
    await writeFile(presetPath, `${JSON.stringify(preset, null, 2)}\n`);
    updated.push(`arena-presets/${entry.name}`);
  }

  await mirrorClientAssetFilesToDist(repoRoot, assetRoot, updated);
  return updated.sort();
}

export async function persistArenaPresetToProject(repoRoot: string, value: unknown): Promise<string[]> {
  const preset = normalizePublishableArenaPreset(value);
  const assetRoot = writableClientAssetRoot(repoRoot);
  const presetDir = resolve(assetRoot.absolute, 'arena-presets');
  await mkdir(presetDir, { recursive: true });

  const presetFilename = `${preset.presetId}.json`;
  const presetPath = resolveUnderBase(presetDir, presetFilename);
  const existingPreset = await readJsonRecordIfExists(presetPath);
  const mergedPreset = mergePublishedPreset(existingPreset, preset);
  await writeFile(presetPath, `${JSON.stringify(mergedPreset, null, 2)}\n`);
  invalidateServerVoxelCollision(asNullableString(mergedPreset.voxelCollisionUrl));

  const catalogPath = resolveUnderBase(presetDir, 'splat-catalog.json');
  const catalog = await readSplatCatalog(catalogPath, preset.presetId);
  const entry = {
    presetId: mergedPreset.presetId,
    displayName: mergedPreset.displayName,
    presetUrl: `/arena-presets/${presetFilename}`,
    splatUrl: mergedPreset.splatUrl,
    splatFileSizeBytes: typeof mergedPreset.splatFileSizeBytes === 'number' ? mergedPreset.splatFileSizeBytes : undefined,
    enabledModes: mergedPreset.enabledModes
  };
  const maps = [
    ...catalog.maps.filter((map) => map.presetId !== mergedPreset.presetId),
    entry
  ].sort((a, b) => a.displayName.localeCompare(b.displayName));
  const nextCatalog: SplatMapPoolCatalog = {
    defaultPresetId: catalog.defaultPresetId || mergedPreset.presetId,
    maps
  };
  await writeFile(catalogPath, `${JSON.stringify(nextCatalog, null, 2)}\n`);

  const updated = [`arena-presets/${presetFilename}`, 'arena-presets/splat-catalog.json'];
  await mirrorClientAssetFilesToDist(repoRoot, assetRoot, updated);
  return updated.sort();
}

async function readSplatCatalog(catalogPath: string, fallbackPresetId: string): Promise<SplatMapPoolCatalog> {
  try {
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as SplatMapPoolCatalog;
    return {
      defaultPresetId: typeof catalog.defaultPresetId === 'string' ? catalog.defaultPresetId : fallbackPresetId,
      maps: Array.isArray(catalog.maps) ? catalog.maps : []
    };
  } catch {
    return { defaultPresetId: fallbackPresetId, maps: [] };
  }
}

async function readJsonRecordIfExists(path: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
    return isJsonRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizePublishableArenaPreset(value: unknown): Record<string, unknown> & {
  presetId: string;
  displayName: string;
  splatUrl: string;
  splatFileSizeBytes?: number;
  enabledModes: ReturnType<typeof resolveEnabledModes>;
} {
  const data = asRecord(value);
  const presetId = sanitizeArenaId(requiredString(data.presetId, 'presetId'));
  const displayName = typeof data.displayName === 'string' && data.displayName.trim() ? data.displayName.trim() : presetId;
  const splatUrl = requiredString(data.splatUrl, 'splatUrl');
  const splatPathname = safeDecodedPathname(splatUrl);
  if (!splatPathname.startsWith('/splats/') || extname(splatPathname).toLowerCase() !== '.sog') {
    throw new Error('preset.splatUrl must point to a /splats/*.sog asset');
  }

  const normalized: Record<string, unknown> & {
    presetId: string;
    displayName: string;
    splatUrl: string;
    splatFileSizeBytes?: number;
    enabledModes: ReturnType<typeof resolveEnabledModes>;
  } = {
    ...data,
    presetId,
    arenaId: 'splat-test',
    displayName,
    type: 'splat',
    splatUrl,
    enabledModes: resolveEnabledModes(data),
    spawnPoints: resolveSpawnPointsForMode(data, '1v1'),
    spawnPointsByMode: {
      '1v1': resolveSpawnPointsForMode(data, '1v1'),
      '2v2': resolveSpawnPointsForMode(data, '2v2')
    }
  };
  if (typeof data.splatFileSizeBytes === 'number' && Number.isFinite(data.splatFileSizeBytes)) {
    normalized.splatFileSizeBytes = data.splatFileSizeBytes;
  }
  return normalized;
}

function mergePublishedPreset(
  existing: Record<string, unknown> | null,
  next: Record<string, unknown> & {
    presetId: string;
    displayName: string;
    splatUrl: string;
    splatFileSizeBytes?: number;
    enabledModes: ReturnType<typeof resolveEnabledModes>;
  }
): typeof next {
  if (!existing) {
    return next;
  }

  return {
    ...existing,
    ...next,
    collisionMeshUrl: hasOwn(existing, next, 'collisionMeshUrl'),
    voxelCollisionUrl: hasOwn(existing, next, 'voxelCollisionUrl'),
    collisionWalls: hasOwn(existing, next, 'collisionWalls'),
    collisionErasers: hasOwn(existing, next, 'collisionErasers')
  };
}

function hasOwn(
  existing: Record<string, unknown>,
  next: Record<string, unknown>,
  key: 'collisionMeshUrl' | 'voxelCollisionUrl' | 'collisionWalls' | 'collisionErasers'
): unknown {
  return Object.prototype.hasOwnProperty.call(next, key) ? next[key] : existing[key];
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asFilterBox(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 6 || parts.some((part) => !Number.isFinite(part))) return null;
  const [minX, minY, minZ, maxX, maxY, maxZ] = parts;
  if (minX >= maxX || minY >= maxY || minZ >= maxZ) return null;
  return parts.map((part) => String(Math.round(part * 1000) / 1000)).join(',');
}

async function mirrorGeneratedCollisionToDist(repoRoot: string, assetRoot: ClientAssetRoot, arenaId: string): Promise<void> {
  if (assetRoot.relative === 'client/dist') return;

  const distCollisionDir = resolve(repoRoot, 'client', 'dist', 'collision');
  await mkdir(distCollisionDir, { recursive: true });
  for (const filename of [`${arenaId}.collision.glb`, `${arenaId}.voxel.json`, `${arenaId}.voxel.bin`, `${arenaId}.generated.json`]) {
    const source = resolveUnderBase(resolve(assetRoot.absolute, 'collision'), filename);
    if (!existsSync(source)) continue;
    const target = resolveUnder(repoRoot, join('client', 'dist', 'collision'), filename);
    await copyFile(source, target);
  }
}

async function mirrorClientAssetFilesToDist(repoRoot: string, assetRoot: ClientAssetRoot, relativeAssetPaths: string[]): Promise<void> {
  if (relativeAssetPaths.length === 0 || assetRoot.relative === 'client/dist') return;

  const distDir = resolve(repoRoot, 'client', 'dist');
  if (!existsSync(distDir)) return;

  for (const relativeAssetPath of relativeAssetPaths) {
    const source = resolveUnderBase(assetRoot.absolute, relativeAssetPath);
    const target = resolveUnder(repoRoot, join('client', 'dist'), relativeAssetPath);
    await mkdir(resolve(target, '..'), { recursive: true });
    await copyFile(source, target);
  }
}

async function writeGeneratedCollisionMarker(repoRoot: string, assetRoot: ClientAssetRoot, request: SplatCollisionDevRequest): Promise<void> {
  const markerPath = resolveUnderBase(resolve(assetRoot.absolute, 'collision'), `${request.arenaId}.generated.json`);
  await writeFile(markerPath, `${JSON.stringify({
    generatedBy: 'magic-casters-dev-api',
    arenaId: request.arenaId,
    splatFilename: request.splatFilename,
    collisionMeshUrl: request.collisionMeshUrl,
    voxelCollisionUrl: request.voxelCollisionUrl,
    generatedAt: new Date().toISOString()
  }, null, 2)}\n`);
}

function runCollisionScript(
  repoRoot: string,
  assetRoot: ClientAssetRoot,
  splatFilename: string,
  arenaId: string,
  options: { largeMode: boolean; filterBox: string | null }
): Promise<{ exitCode: number | null; output: string }> {
  return new Promise((resolvePromise) => {
    const args = [
      'tools/generate-splat-collision.mjs',
      '--input',
      `${assetRoot.relative}/splats/${splatFilename}`,
      '--arena',
      arenaId,
      '--outputDir',
      `${assetRoot.relative}/collision`
    ];
    if (options.largeMode) {
      args.push('--large');
    }
    if (options.filterBox) {
      args.push('--filter-box', options.filterBox);
    }
    const timeoutMs = options.largeMode ? LARGE_GENERATE_TIMEOUT_MS : GENERATE_TIMEOUT_MS;
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      shell: false,
      windowsHide: true
    });

    let output = '';
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill();
      settle(null, `${output}\nTimed out after ${timeoutMs / 1000}s.`);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      output = appendLimited(output, String(chunk));
    });
    child.stderr.on('data', (chunk) => {
      output = appendLimited(output, String(chunk));
    });
    child.on('error', (error) => {
      settle(1, `${output}\n${errorMessage(error)}`);
    });
    child.on('close', (code) => {
      settle(code, output);
    });

    function settle(exitCode: number | null, nextOutput: string): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolvePromise({ exitCode, output: nextOutput.trim() });
    }
  });
}

function collisionCommandForRequest(request: SplatCollisionDevRequest, largeMode: boolean, assetRoot: ClientAssetRoot = { absolute: '', relative: 'client/public' }): string {
  return `npm run splat:collision -- --input "${assetRoot.relative}/splats/${request.splatFilename}" --arena ${request.arenaId} --outputDir "${assetRoot.relative}/collision"${largeMode ? ' --large' : ''}${request.playableFilterBox ? ` --filter-box "${request.playableFilterBox}"` : ''}`;
}

function formatCollisionScriptError(
  result: { exitCode: number | null; output: string },
  largeMode: boolean
): string {
  if (result.exitCode === null) {
    return `splat-transform timed out${largeMode ? ' in large-map mode' : ''}. Try the shown command manually so you can see the full output.`;
  }
  if (/too large for direct whole-map voxelization/i.test(result.output)) {
    return 'This SOG is too large for direct whole-map auto-collision. Use SuperSplat to crop/export a smaller collision source, or rerun the command with --filter-box / --filter-sphere for one zone.';
  }
  if (/Invalid array length|loseContext|device lost|out of memory/i.test(result.output)) {
    return `splat-transform could not voxelize this SOG at the current density. Try a more aggressive command, for example add --decimate 0.5% --voxel-size 0.4 --opacity 0.4 --no-external-fill --no-floor-fill --carve none.`;
  }
  return `splat-transform exited with code ${result.exitCode}`;
}

function findRepoRoot(start = process.cwd()): string {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, 'package.json')) && existsSync(join(current, 'client')) && existsSync(join(current, 'server'))) {
      return current;
    }
    const parent = resolve(current, '..');
    if (parent === current) return resolve(start);
    current = parent;
  }
}

function writableClientAssetRoot(repoRoot: string): ClientAssetRoot {
  const publicRoot = resolve(repoRoot, 'client', 'public');
  if (existsSync(publicRoot)) {
    return { absolute: publicRoot, relative: 'client/public' };
  }
  return { absolute: resolve(repoRoot, 'client', 'dist'), relative: 'client/dist' };
}

function resolveUnder(root: string, relativeBase: string, filename: string): string {
  const base = resolve(root, relativeBase);
  return resolveUnderBase(base, filename);
}

function resolveUnderBase(base: string, filename: string): string {
  const candidate = resolve(base, filename);
  const normalizedBase = normalize(base + sep);
  if (!candidate.startsWith(normalizedBase)) {
    throw new Error('Resolved path escaped the expected collision workspace');
  }
  return candidate;
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolvePromise(raw.trim() ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Request body must be JSON'));
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response: ServerResponse, status: number, payload: object): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function safeApiPathname(url: string | undefined): string {
  try {
    return new URL(url ?? '/', 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

function safeDecodedPathname(url: string): string {
  try {
    return decodeURIComponent(new URL(url, 'http://localhost').pathname);
  } catch {
    return '';
  }
}

function sanitizeArenaId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '') || 'splat-arena';
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Request body must be an object');
  }
  return value as Record<string, unknown>;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Request missing ${name}`);
  }
  return value;
}

function appendLimited(output: string, chunk: string): string {
  const next = `${output}${chunk}`;
  return next.length <= MAX_OUTPUT_BYTES ? next : next.slice(next.length - MAX_OUTPUT_BYTES);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
