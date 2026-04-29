import {
  ARENA_BOUNDS,
  PLAYER_RADIUS,
  PLAYER_OBSTACLE_CLEARANCE,
  PLAYER_SURFACE_SNAP_TOLERANCE,
  type ArenaBounds,
  type ArenaCollisionConfig,
  type ArenaCollisionWall,
  type ArenaSpawnPoint
} from './types.js';
import {
  findVoxelLandingSurfaceY,
  findVoxelStandingSurfaceY,
  resolveVoxelCapsuleCollision,
  type SparseVoxelCollision
} from './voxelCollision.js';

export const MAX_COLLISION_WALLS = 64;
export const MAX_COLLISION_ERASERS = 64;

export interface ArenaMovementCollisionOptions {
  radius?: number;
  playerY?: number;
  floorY?: number;
  obstacleClearance?: number;
  voxelCollision?: SparseVoxelCollision | null;
  collisionErasers?: ArenaCollisionWall[];
}

export interface ArenaVerticalCollisionResult {
  y: number;
  velocityY: number;
  groundY: number;
  standingOnWallId?: string;
}

export function defaultArenaCollisionConfig(): ArenaCollisionConfig {
  return {
    bounds: { ...ARENA_BOUNDS },
    floorY: 0,
    spawnPoints: [],
    voxelCollisionUrl: null,
    collisionErasers: [],
    collisionWalls: []
  };
}

export function normalizeArenaCollisionConfig(value: unknown): ArenaCollisionConfig {
  const data = isRecord(value) ? value : {};
  return {
    bounds: normalizeBounds(data.bounds),
    floorY: finiteNumber(data.floorY, 0),
    spawnPoints: normalizeSpawnPoints(data.spawnPoints),
    voxelCollisionUrl: normalizeVoxelCollisionUrl(data.voxelCollisionUrl),
    collisionErasers: normalizeCollisionErasers(data.collisionErasers),
    collisionWalls: normalizeCollisionWalls(data.collisionWalls)
  };
}

export function makeArenaCollisionKey(config: ArenaCollisionConfig | null | undefined): string {
  if (!config) return 'default';
  const normalized = normalizeArenaCollisionConfig(config);
  const payload = JSON.stringify({
    bounds: roundRecord(normalized.bounds),
    floorY: roundNumber(normalized.floorY),
    spawnPoints: normalized.spawnPoints.map(roundRecord),
    voxelCollisionUrl: normalized.voxelCollisionUrl ?? null,
    collisionErasers: normalized.collisionErasers?.map(roundRecord) ?? [],
    collisionWalls: normalized.collisionWalls.map(roundRecord)
  });
  return `v1-${hashString(payload).toString(36)}`;
}

export function moveWithArenaCollision(
  currentX: number,
  currentZ: number,
  nextX: number,
  nextZ: number,
  bounds: ArenaBounds,
  walls: ArenaCollisionWall[] = [],
  options: number | ArenaMovementCollisionOptions = PLAYER_RADIUS
): { x: number; z: number } {
  const collisionOptions = normalizeMovementOptions(options);
  const radius = collisionOptions.radius;
  const normalizedBounds = normalizeBounds(bounds);
  let x = clamp(nextX, normalizedBounds.minX, normalizedBounds.maxX);
  let z = clamp(nextZ, normalizedBounds.minZ, normalizedBounds.maxZ);

  if (collisionOptions.voxelCollision && Number.isFinite(collisionOptions.playerY)) {
    const startX = clamp(currentX, normalizedBounds.minX, normalizedBounds.maxX);
    const startZ = clamp(currentZ, normalizedBounds.minZ, normalizedBounds.maxZ);
    const dx = x - startX;
    const dz = z - startZ;
    const distance = Math.hypot(dx, dz);
    const stepDistance = Math.max(0.1, Math.min(radius * 0.5, collisionOptions.voxelCollision.voxelResolution * 2));
    const steps = Math.max(1, Math.ceil(distance / stepDistance));
    x = startX;
    z = startZ;

    for (let step = 1; step <= steps; step++) {
      const targetX = startX + (dx * step) / steps;
      const targetZ = startZ + (dz * step) / steps;
      const voxelResolved = resolveVoxelCapsuleCollision(
        collisionOptions.voxelCollision,
        targetX,
        collisionOptions.playerY,
        targetZ,
        {
          radius,
          floorY: collisionOptions.floorY,
          erasers: collisionOptions.collisionErasers
        }
      );
      x = voxelResolved.x;
      z = voxelResolved.z;
      if (voxelResolved.collided && Math.hypot(voxelResolved.pushX, voxelResolved.pushZ) > radius * 0.25) {
        break;
      }
    }
  }

  const wallResolved = moveThroughCollisionWalls(
    clamp(currentX, normalizedBounds.minX, normalizedBounds.maxX),
    clamp(currentZ, normalizedBounds.minZ, normalizedBounds.maxZ),
    x,
    z,
    walls,
    collisionOptions
  );
  x = wallResolved.x;
  z = wallResolved.z;

  x = clamp(x, normalizedBounds.minX, normalizedBounds.maxX);
  z = clamp(z, normalizedBounds.minZ, normalizedBounds.maxZ);

  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return { x: currentX, z: currentZ };
  }
  return { x, z };
}

export function circleIntersectsWall(x: number, z: number, radius: number, wall: ArenaCollisionWall): boolean {
  const local = worldToWallLocal(x, z, wall);
  const halfW = Math.max(0.01, wall.width / 2);
  const halfD = Math.max(0.01, wall.depth / 2);
  const nearestX = clamp(local.x, -halfW, halfW);
  const nearestZ = clamp(local.z, -halfD, halfD);
  const dx = local.x - nearestX;
  const dz = local.z - nearestZ;
  return dx * dx + dz * dz <= radius * radius;
}

export function pointIntersectsWalls(x: number, z: number, walls: ArenaCollisionWall[], radius = 0.05): boolean {
  return walls.some((wall) => !wall.climbable && circleIntersectsWall(x, z, radius, wall));
}

export function resolveArenaVerticalCollision(
  x: number,
  z: number,
  previousY: number,
  nextY: number,
  velocityY: number,
  floorY: number,
  walls: ArenaCollisionWall[] = [],
  radius = PLAYER_RADIUS,
  voxelOptions: Pick<Required<ArenaMovementCollisionOptions>, 'voxelCollision' | 'collisionErasers'> = {
    voxelCollision: null,
    collisionErasers: []
  }
): ArenaVerticalCollisionResult {
  const landingSurface = findLandingSurface(x, z, previousY, nextY, velocityY, floorY, walls, radius);
  const voxelLandingY = velocityY <= 0 && voxelOptions.voxelCollision
    ? findVoxelLandingSurfaceY(voxelOptions.voxelCollision, x, z, previousY, nextY, {
        radius,
        floorY,
        erasers: voxelOptions.collisionErasers
      })
    : null;
  const landingY = Math.max(
    landingSurface?.y ?? Number.NEGATIVE_INFINITY,
    voxelLandingY ?? Number.NEGATIVE_INFINITY
  );
  if (landingY > Number.NEGATIVE_INFINITY) {
    return {
      y: landingY,
      velocityY: 0,
      groundY: landingY,
      standingOnWallId: landingSurface?.y === landingY ? landingSurface.wallId : undefined
    };
  }

  if (nextY <= floorY) {
    return { y: floorY, velocityY: 0, groundY: floorY };
  }

  return {
    y: nextY,
    velocityY,
    groundY: findStandingSurfaceY(x, z, nextY, floorY, walls, radius, PLAYER_SURFACE_SNAP_TOLERANCE, voxelOptions)
  };
}

export function findStandingSurfaceY(
  x: number,
  z: number,
  playerY: number,
  floorY: number,
  walls: ArenaCollisionWall[] = [],
  radius = PLAYER_RADIUS,
  snapTolerance = PLAYER_SURFACE_SNAP_TOLERANCE,
  voxelOptions: Pick<Required<ArenaMovementCollisionOptions>, 'voxelCollision' | 'collisionErasers'> = {
    voxelCollision: null,
    collisionErasers: []
  }
): number {
  let groundY = floorY;
  if (voxelOptions.voxelCollision) {
    const voxelGroundY = findVoxelStandingSurfaceY(voxelOptions.voxelCollision, x, z, playerY, {
      radius,
      floorY,
      erasers: voxelOptions.collisionErasers
    });
    if (voxelGroundY !== null) {
      groundY = Math.max(groundY, voxelGroundY);
    }
  }
  for (const wall of walls) {
    if (wall.climbable) continue;
    const topY = wallTopY(wall, floorY);
    if (topY < groundY) continue;
    if (Math.abs(playerY - topY) > snapTolerance) continue;
    if (!circleIntersectsWall(x, z, radius, wall)) continue;
    groundY = topY;
  }
  return groundY;
}

export function findClimbableWall(
  x: number,
  z: number,
  walls: ArenaCollisionWall[],
  radius = PLAYER_RADIUS
): ArenaCollisionWall | null {
  return walls.find((wall) => wall.climbable && circleIntersectsWall(x, z, radius, wall)) ?? null;
}

export function normalizeBounds(value: unknown): ArenaBounds {
  const data = isRecord(value) ? value : {};
  const minX = finiteNumber(data.minX, ARENA_BOUNDS.minX);
  const maxX = finiteNumber(data.maxX, ARENA_BOUNDS.maxX);
  const minZ = finiteNumber(data.minZ, ARENA_BOUNDS.minZ);
  const maxZ = finiteNumber(data.maxZ, ARENA_BOUNDS.maxZ);
  return {
    minX: Math.min(minX, maxX),
    maxX: Math.max(minX, maxX),
    minZ: Math.min(minZ, maxZ),
    maxZ: Math.max(minZ, maxZ)
  };
}

export function normalizeCollisionWalls(value: unknown): ArenaCollisionWall[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_COLLISION_WALLS).map((entry, index) => normalizeCollisionWall(entry, index));
}

export function normalizeCollisionErasers(value: unknown): ArenaCollisionWall[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_COLLISION_ERASERS).map((entry, index) => normalizeCollisionWall(entry, index));
}

function resolveCircleFromWall(x: number, z: number, radius: number, wall: ArenaCollisionWall): { x: number; z: number } {
  const local = worldToWallLocal(x, z, wall);
  const halfW = Math.max(0.01, wall.width / 2);
  const halfD = Math.max(0.01, wall.depth / 2);
  const nearestX = clamp(local.x, -halfW, halfW);
  const nearestZ = clamp(local.z, -halfD, halfD);
  let dx = local.x - nearestX;
  let dz = local.z - nearestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq > radius * radius) {
    return { x, z };
  }

  let resolvedX = local.x;
  let resolvedZ = local.z;
  if (distSq > 0.000001) {
    const distance = Math.sqrt(distSq);
    const push = radius - distance;
    resolvedX += (dx / distance) * push;
    resolvedZ += (dz / distance) * push;
  } else {
    const toRight = halfW - local.x;
    const toLeft = local.x + halfW;
    const toTop = halfD - local.z;
    const toBottom = local.z + halfD;
    const min = Math.min(toRight, toLeft, toTop, toBottom);
    if (min === toRight) resolvedX = halfW + radius;
    else if (min === toLeft) resolvedX = -halfW - radius;
    else if (min === toTop) resolvedZ = halfD + radius;
    else resolvedZ = -halfD - radius;
  }

  return wallLocalToWorld(resolvedX, resolvedZ, wall);
}

function moveThroughCollisionWalls(
  startX: number,
  startZ: number,
  targetX: number,
  targetZ: number,
  walls: ArenaCollisionWall[],
  options: Required<ArenaMovementCollisionOptions>
): { x: number; z: number } {
  const blockingWalls = walls.filter((wall) => !wall.climbable && wallBlocksAtPlayerHeight(wall, options));
  if (blockingWalls.length === 0) return { x: targetX, z: targetZ };

  const dx = targetX - startX;
  const dz = targetZ - startZ;
  const distance = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(distance / Math.max(0.1, options.radius * 0.5)));
  let x = startX;
  let z = startZ;

  for (let step = 1; step <= steps; step++) {
    let stepX = startX + (dx * step) / steps;
    let stepZ = startZ + (dz * step) / steps;
    const requestedX = stepX;
    const requestedZ = stepZ;

    for (const wall of blockingWalls) {
      const resolved = resolveCircleFromWall(stepX, stepZ, options.radius, wall);
      stepX = resolved.x;
      stepZ = resolved.z;
    }

    x = stepX;
    z = stepZ;
    if (Math.hypot(stepX - requestedX, stepZ - requestedZ) > 0.0001) {
      break;
    }
  }

  return { x, z };
}

function findLandingSurface(
  x: number,
  z: number,
  previousY: number,
  nextY: number,
  velocityY: number,
  floorY: number,
  walls: ArenaCollisionWall[],
  radius: number
): { y: number; wallId: string } | null {
  if (velocityY > 0) return null;

  let surface: { y: number; wallId: string } | null = null;
  for (const wall of walls) {
    if (wall.climbable) continue;
    const topY = wallTopY(wall, floorY);
    if (previousY < topY - PLAYER_SURFACE_SNAP_TOLERANCE) continue;
    if (nextY > topY + PLAYER_SURFACE_SNAP_TOLERANCE) continue;
    if (!circleIntersectsWall(x, z, radius, wall)) continue;
    if (!surface || topY > surface.y) {
      surface = { y: topY, wallId: wall.id };
    }
  }
  return surface;
}

function wallBlocksAtPlayerHeight(wall: ArenaCollisionWall, options: Required<ArenaMovementCollisionOptions>): boolean {
  if (!Number.isFinite(options.playerY) || !Number.isFinite(options.floorY)) {
    return true;
  }
  return options.playerY < wallTopY(wall, options.floorY) - options.obstacleClearance;
}

function wallTopY(wall: ArenaCollisionWall, floorY: number): number {
  return floorY + Math.max(0.1, wall.height);
}

function normalizeMovementOptions(options: number | ArenaMovementCollisionOptions): Required<ArenaMovementCollisionOptions> {
  if (typeof options === 'number') {
    return {
      radius: Number.isFinite(options) ? options : PLAYER_RADIUS,
      playerY: Number.NaN,
      floorY: Number.NaN,
      obstacleClearance: PLAYER_OBSTACLE_CLEARANCE,
      voxelCollision: null,
      collisionErasers: []
    };
  }

  return {
    radius: finiteNumber(options.radius, PLAYER_RADIUS),
    playerY: finiteNumber(options.playerY, Number.NaN),
    floorY: finiteNumber(options.floorY, Number.NaN),
    obstacleClearance: Math.max(0, finiteNumber(options.obstacleClearance, PLAYER_OBSTACLE_CLEARANCE)),
    voxelCollision: options.voxelCollision ?? null,
    collisionErasers: Array.isArray(options.collisionErasers) ? options.collisionErasers : []
  };
}

function normalizeCollisionWall(value: unknown, index: number): ArenaCollisionWall {
  const data = isRecord(value) ? value : {};
  return {
    id: typeof data.id === 'string' && data.id.trim() ? data.id : `wall-${index + 1}`,
    x: finiteNumber(data.x, 0),
    z: finiteNumber(data.z, 0),
    width: clamp(Math.abs(finiteNumber(data.width, 2)), 0.1, 40),
    depth: clamp(Math.abs(finiteNumber(data.depth, 0.35)), 0.1, 40),
    height: clamp(Math.abs(finiteNumber(data.height, 2)), 0.1, 20),
    rotY: finiteNumber(data.rotY, 0),
    climbable: Boolean(data.climbable) || Boolean(data.isLadder) || data.kind === 'ladder' || data.type === 'ladder'
  };
}

function normalizeSpawnPoints(value: unknown): ArenaSpawnPoint[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((entry) => {
    const data = isRecord(entry) ? entry : {};
    return {
      x: finiteNumber(data.x, 0),
      y: finiteNumber(data.y, 0),
      z: finiteNumber(data.z, 0),
      rotY: finiteNumber(data.rotY, 0)
    };
  });
}

function normalizeVoxelCollisionUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.startsWith('/collision/') && trimmed.endsWith('.voxel.json') ? trimmed : null;
}

function worldToWallLocal(x: number, z: number, wall: ArenaCollisionWall): { x: number; z: number } {
  const dx = x - wall.x;
  const dz = z - wall.z;
  const cos = Math.cos(wall.rotY);
  const sin = Math.sin(wall.rotY);
  return {
    x: dx * cos - dz * sin,
    z: dx * sin + dz * cos
  };
}

function wallLocalToWorld(x: number, z: number, wall: ArenaCollisionWall): { x: number; z: number } {
  const cos = Math.cos(wall.rotY);
  const sin = Math.sin(wall.rotY);
  return {
    x: wall.x + x * cos + z * sin,
    z: wall.z - x * sin + z * cos
  };
}

function roundRecord(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    typeof entry === 'number' ? roundNumber(entry) : entry
  ]));
}

function roundNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
