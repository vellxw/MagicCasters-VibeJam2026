import * as THREE from 'three';
import type { ArenaBounds, ArenaCollisionWall } from '../../../shared/types';
import type { SplatArenaPreset, SplatCalibrationSettings } from './ArenaPreset';

const AUTO_COLLISION_CELL_SIZE = 0.85;
const AUTO_COLLISION_MAX_WALLS = 64;
const AUTO_COLLISION_MIN_HEIGHT = 0.35;
const AUTO_COLLISION_VERTEX_Y_THRESHOLD = 0.22;
const AUTO_COLLISION_MAX_VERTEX_SAMPLES = 60000;

export interface SplatCollisionDevApiResult {
  ok: boolean;
  arenaId?: string;
  collisionMeshUrl?: string;
  voxelCollisionUrl?: string;
  deleted?: string[];
  updatedPresets?: string[];
  output?: string;
  error?: string;
  command?: string;
  endpoint?: string;
}

interface SplatCollisionDevStatus {
  ok?: boolean;
  enabled?: boolean;
  production?: boolean;
}

interface AutoCollisionCell {
  ix: number;
  iz: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
  count: number;
}

export async function requestDevSplatCollisionGeneration(preset: SplatArenaPreset): Promise<SplatCollisionDevApiResult> {
  return postDevCollisionApi('generate', preset);
}

export async function requestDevSplatCollisionDeletion(preset: SplatArenaPreset): Promise<SplatCollisionDevApiResult> {
  return postDevCollisionApi('delete', preset);
}

export async function requestDevSplatMapPublish(preset: SplatArenaPreset): Promise<SplatCollisionDevApiResult> {
  const errors: string[] = [];

  for (const baseUrl of resolveDevApiBaseUrls()) {
    const status = await fetchDevApiStatus(baseUrl, '/api/dev/splat-map/status');
    if (!status.available) {
      errors.push(`${baseUrl}: ${status.error}`);
      continue;
    }
    if (!status.enabled) {
      errors.push(`${baseUrl}: map publish disabled${status.production ? ' in production' : ''}`);
      continue;
    }

    const result = await postDevMapPublishApiToBaseUrl(preset, baseUrl);
    if (result.ok) return result;
    errors.push(`${baseUrl}: ${result.error ?? 'request failed'}`);
    if (!isNetworkLikeError(result.error)) return result;
  }

  return {
    ok: false,
    command: 'Run npm run dev locally, then use Publish Map To Game again.',
    error: `Splat map publish endpoint unavailable. ${errors.join(' | ') || 'No endpoint candidates responded.'}`
  };
}

export async function generateAutoCollisionWallsFromGlbUrl(
  collisionMeshUrl: string,
  settings: SplatCalibrationSettings
): Promise<ArenaCollisionWall[]> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(collisionMeshUrl);
  try {
    return generateAutoCollisionWallsFromObject(gltf.scene, settings);
  } finally {
    disposeObjectTree(gltf.scene);
  }
}

export function generateAutoCollisionWallsFromObject(
  root: THREE.Object3D,
  settings: SplatCalibrationSettings
): ArenaCollisionWall[] {
  root.updateWorldMatrix(true, true);
  const gridWalls = generateGridWallsFromVertices(root, settings);
  if (gridWalls.length > 0) return gridWalls;
  return generateMeshBoundsWalls(root, settings);
}

function generateGridWallsFromVertices(root: THREE.Object3D, settings: SplatCalibrationSettings): ArenaCollisionWall[] {
  const cells = new Map<string, AutoCollisionCell>();
  const bounds = normalizeBounds(settings.bounds);
  const boundsPadding = AUTO_COLLISION_CELL_SIZE * 2;
  const point = new THREE.Vector3();

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const geometry = mesh.geometry;
    const position = geometry?.attributes?.position;
    if (!mesh.isMesh || !position) return;

    const step = Math.max(1, Math.ceil(position.count / AUTO_COLLISION_MAX_VERTEX_SAMPLES));
    for (let index = 0; index < position.count; index += step) {
      point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
      if (point.y < settings.floorY + AUTO_COLLISION_VERTEX_Y_THRESHOLD) continue;
      if (
        point.x < bounds.minX - boundsPadding ||
        point.x > bounds.maxX + boundsPadding ||
        point.z < bounds.minZ - boundsPadding ||
        point.z > bounds.maxZ + boundsPadding
      ) {
        continue;
      }

      const ix = Math.floor(point.x / AUTO_COLLISION_CELL_SIZE);
      const iz = Math.floor(point.z / AUTO_COLLISION_CELL_SIZE);
      const key = `${ix}:${iz}`;
      const cell = cells.get(key) ?? {
        ix,
        iz,
        minX: point.x,
        maxX: point.x,
        minZ: point.z,
        maxZ: point.z,
        maxY: point.y,
        count: 0
      };
      cell.minX = Math.min(cell.minX, point.x);
      cell.maxX = Math.max(cell.maxX, point.x);
      cell.minZ = Math.min(cell.minZ, point.z);
      cell.maxZ = Math.max(cell.maxZ, point.z);
      cell.maxY = Math.max(cell.maxY, point.y);
      cell.count++;
      cells.set(key, cell);
    }
  });

  return Array.from(cells.values())
    .map((cell): ArenaCollisionWall | null => {
      const height = cell.maxY - settings.floorY;
      if (cell.count < 3 || height < AUTO_COLLISION_MIN_HEIGHT) return null;
      return {
        id: `cell-${cell.ix}-${cell.iz}`,
        x: (cell.ix + 0.5) * AUTO_COLLISION_CELL_SIZE,
        z: (cell.iz + 0.5) * AUTO_COLLISION_CELL_SIZE,
        width: Math.max(AUTO_COLLISION_CELL_SIZE, cell.maxX - cell.minX + 0.2),
        depth: Math.max(AUTO_COLLISION_CELL_SIZE, cell.maxZ - cell.minZ + 0.2),
        height: clamp(height, AUTO_COLLISION_MIN_HEIGHT, 20),
        rotY: 0,
        climbable: false
      };
    })
    .filter((wall): wall is ArenaCollisionWall => Boolean(wall))
    .sort((a, b) => (b.height * b.width * b.depth) - (a.height * a.width * a.depth))
    .slice(0, AUTO_COLLISION_MAX_WALLS);
}

function generateMeshBoundsWalls(root: THREE.Object3D, settings: SplatCalibrationSettings): ArenaCollisionWall[] {
  const bounds = normalizeBounds(settings.bounds);
  const arenaWidth = Math.max(0.01, bounds.maxX - bounds.minX);
  const arenaDepth = Math.max(0.01, bounds.maxZ - bounds.minZ);
  const walls: ArenaCollisionWall[] = [];

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;

    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const height = box.max.y - settings.floorY;
    const isLikelyFloor = size.x > arenaWidth * 0.9 && size.z > arenaDepth * 0.9 && height < 0.75;
    if (isLikelyFloor || height < AUTO_COLLISION_MIN_HEIGHT || size.x < 0.2 || size.z < 0.2) return;

    walls.push({
      id: `mesh-${walls.length + 1}`,
      x: center.x,
      z: center.z,
      width: clamp(size.x, 0.2, 40),
      depth: clamp(size.z, 0.2, 40),
      height: clamp(height, AUTO_COLLISION_MIN_HEIGHT, 20),
      rotY: mesh.rotation.y,
      climbable: false
    });
  });

  return walls
    .sort((a, b) => (b.height * b.width * b.depth) - (a.height * a.width * a.depth))
    .slice(0, AUTO_COLLISION_MAX_WALLS);
}

async function postDevCollisionApi(action: 'generate' | 'delete', preset: SplatArenaPreset): Promise<SplatCollisionDevApiResult> {
  const command = fallbackCollisionCommand(preset);
  const errors: string[] = [];

  for (const baseUrl of resolveDevApiBaseUrls()) {
    const status = await fetchDevApiStatus(baseUrl, '/api/dev/splat-collision/status');
    if (!status.available) {
      errors.push(`${baseUrl}: ${status.error}`);
      continue;
    }
    if (!status.enabled) {
      errors.push(`${baseUrl}: generator disabled${status.production ? ' in production' : ''}`);
      continue;
    }

    const result = await postDevCollisionApiToBaseUrl(action, preset, baseUrl, command);
    if (result.ok) return result;
    errors.push(`${baseUrl}: ${result.error ?? 'request failed'}`);
    if (!isNetworkLikeError(result.error)) return result;
  }

  return {
    ok: false,
    command,
    error: `Auto collision dev endpoint unavailable. ${errors.join(' | ') || 'No endpoint candidates responded.'}`
  };
}

async function postDevMapPublishApiToBaseUrl(
  preset: SplatArenaPreset,
  baseUrl: string
): Promise<SplatCollisionDevApiResult> {
  try {
    const response = await fetch(`${baseUrl}/api/dev/splat-map/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(preset)
    });
    const payload = await response.json().catch(() => ({})) as SplatCollisionDevApiResult;
    const ok = response.ok && payload.ok === true;
    return {
      ...payload,
      ok,
      endpoint: baseUrl,
      error: payload.error ?? (ok ? undefined : `HTTP ${response.status}`)
    };
  } catch (error) {
    return {
      ok: false,
      endpoint: baseUrl,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function postDevCollisionApiToBaseUrl(
  action: 'generate' | 'delete',
  preset: SplatArenaPreset,
  baseUrl: string,
  command: string
): Promise<SplatCollisionDevApiResult> {
  try {
    const response = await fetch(`${baseUrl}/api/dev/splat-collision/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        arenaId: preset.presetId,
        splatUrl: preset.splatUrl,
        playableFilterBox: buildPlayableFilterBox(preset)
      })
    });
    const payload = await response.json().catch(() => ({})) as SplatCollisionDevApiResult;
    const ok = response.ok && payload.ok === true;
    return {
      ...payload,
      ok,
      command: payload.command ?? command,
      endpoint: baseUrl,
      error: payload.error ?? (ok ? undefined : `HTTP ${response.status}`)
    };
  } catch (error) {
    return {
      ok: false,
      command,
      endpoint: baseUrl,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function fetchDevApiStatus(
  baseUrl: string,
  path: '/api/dev/splat-collision/status' | '/api/dev/splat-map/status'
): Promise<{ available: boolean; enabled: boolean; production: boolean; error?: string }> {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'GET',
      cache: 'no-store'
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok || !contentType.includes('application/json')) {
      return { available: false, enabled: false, production: false, error: `status unavailable (${response.status})` };
    }
    const status = await response.json() as SplatCollisionDevStatus;
    if (status.ok !== true) {
      return { available: false, enabled: false, production: false, error: 'status payload is not the dev API' };
    }
    return {
      available: true,
      enabled: status.enabled === true,
      production: status.production === true
    };
  } catch (error) {
    return {
      available: false,
      enabled: false,
      production: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function resolveDevApiBaseUrls(): string[] {
  const urls = [location.origin];
  const envUrl = import.meta.env.VITE_COLYSEUS_URL as string | undefined;
  if (envUrl) {
    urls.push(envUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:'));
  }
  if (location.port === '5173' || location.port === '4174') {
    urls.push(`${location.protocol}//${location.hostname}:3001`);
  }
  return Array.from(new Set(urls.map((url) => url.replace(/\/$/, ''))));
}

function fallbackCollisionCommand(preset: SplatArenaPreset): string {
  const filename = splatFilenameFromUrl(preset.splatUrl) ?? '<arena>.sog';
  const largeFlag = typeof preset.splatFileSizeBytes === 'number' && preset.splatFileSizeBytes >= 80 * 1024 * 1024
    ? ' --large'
    : '';
  const filterBox = buildPlayableFilterBox(preset);
  return `npm run splat:collision -- --input "${`client/public/splats/${filename}`}" --arena ${sanitizeArenaId(preset.presetId)}${largeFlag} --filter-box "${filterBox}"`;
}

function buildPlayableFilterBox(preset: SplatArenaPreset): string {
  const bounds = normalizeBounds(preset.bounds);
  const horizontalPadding = 1.25;
  const minY = preset.floorY - 0.75;
  const maxY = preset.floorY + 5;
  const scale = Number.isFinite(preset.scale) && Math.abs(preset.scale) > 0.0001 ? preset.scale : 1;
  const inverseRotation = new THREE.Euler(
    THREE.MathUtils.degToRad(-(preset.rotation?.x ?? 0)),
    THREE.MathUtils.degToRad(-(preset.rotation?.y ?? 0)),
    THREE.MathUtils.degToRad(-(preset.rotation?.z ?? 0)),
    'XYZ'
  );
  const points = [
    new THREE.Vector3(bounds.minX - horizontalPadding, minY, bounds.minZ - horizontalPadding),
    new THREE.Vector3(bounds.minX - horizontalPadding, minY, bounds.maxZ + horizontalPadding),
    new THREE.Vector3(bounds.maxX + horizontalPadding, minY, bounds.minZ - horizontalPadding),
    new THREE.Vector3(bounds.maxX + horizontalPadding, minY, bounds.maxZ + horizontalPadding),
    new THREE.Vector3(bounds.minX - horizontalPadding, maxY, bounds.minZ - horizontalPadding),
    new THREE.Vector3(bounds.minX - horizontalPadding, maxY, bounds.maxZ + horizontalPadding),
    new THREE.Vector3(bounds.maxX + horizontalPadding, maxY, bounds.minZ - horizontalPadding),
    new THREE.Vector3(bounds.maxX + horizontalPadding, maxY, bounds.maxZ + horizontalPadding)
  ].map((point) => point
    .sub(new THREE.Vector3(preset.offset.x, preset.offset.y, preset.offset.z))
    .applyEuler(inverseRotation)
    .divideScalar(scale)
  );
  const box = new THREE.Box3().setFromPoints(points);
  return [
    box.min.x,
    box.min.y,
    box.min.z,
    box.max.x,
    box.max.y,
    box.max.z
  ].map(formatFilterNumber).join(',');
}

function formatFilterNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function splatFilenameFromUrl(url: string): string | null {
  try {
    const pathname = decodeURIComponent(new URL(url, location.origin).pathname);
    return pathname.startsWith('/splats/') && pathname.endsWith('.sog')
      ? pathname.slice('/splats/'.length)
      : null;
  } catch {
    return null;
  }
}

function sanitizeArenaId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '') || 'splat-arena';
}

function isNetworkLikeError(error: string | undefined): boolean {
  return !error || /failed to fetch|load failed|network|endpoint unavailable/i.test(error);
}

function normalizeBounds(bounds: ArenaBounds): ArenaBounds {
  return {
    minX: Math.min(bounds.minX, bounds.maxX),
    maxX: Math.max(bounds.minX, bounds.maxX),
    minZ: Math.min(bounds.minZ, bounds.maxZ),
    maxZ: Math.max(bounds.minZ, bounds.maxZ)
  };
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose?.();
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
