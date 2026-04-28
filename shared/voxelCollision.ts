import {
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_SURFACE_SNAP_TOLERANCE,
  type ArenaCollisionWall
} from './types.js';

const SOLID_LEAF_MARKER = 0xFF000000 >>> 0;
const PENETRATION_EPSILON = 1e-4;
const MAX_RESOLVE_ITERATIONS = 4;

export interface VoxelMetadata {
  version?: string;
  gridBounds: {
    min: number[];
    max: number[];
  };
  sceneBounds?: {
    min: number[];
    max: number[];
  };
  voxelResolution: number;
  leafSize: number;
  treeDepth: number;
  nodeCount: number;
  leafDataCount: number;
}

export interface VoxelQueryOptions {
  floorY?: number;
  erasers?: ArenaCollisionWall[];
}

export interface VoxelCapsuleOptions extends VoxelQueryOptions {
  radius?: number;
  height?: number;
}

export interface VoxelCapsuleCollisionResult {
  collided: boolean;
  x: number;
  y: number;
  z: number;
  pushX: number;
  pushY: number;
  pushZ: number;
}

interface PushVector {
  x: number;
  y: number;
  z: number;
}

interface ConstraintNormal {
  x: number;
  y: number;
  z: number;
}

export class SparseVoxelCollision {
  readonly gridMinX: number;
  readonly gridMinY: number;
  readonly gridMinZ: number;
  readonly numVoxelsX: number;
  readonly numVoxelsY: number;
  readonly numVoxelsZ: number;
  readonly voxelResolution: number;
  readonly leafSize: number;
  readonly treeDepth: number;

  private readonly nodes: Uint32Array;
  private readonly leafData: Uint32Array;
  private readonly push: PushVector = { x: 0, y: 0, z: 0 };
  private readonly constraintNormals: ConstraintNormal[] = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 }
  ];

  constructor(metadata: VoxelMetadata, nodes: Uint32Array, leafData: Uint32Array) {
    this.gridMinX = numberFromArray(metadata.gridBounds.min, 0);
    this.gridMinY = numberFromArray(metadata.gridBounds.min, 1);
    this.gridMinZ = numberFromArray(metadata.gridBounds.min, 2);
    this.voxelResolution = finitePositive(metadata.voxelResolution, 0.05);
    this.leafSize = Math.max(1, Math.floor(finitePositive(metadata.leafSize, 4)));
    this.treeDepth = Math.max(0, Math.floor(finitePositive(metadata.treeDepth, 0)));
    this.numVoxelsX = Math.max(0, Math.round((numberFromArray(metadata.gridBounds.max, 0) - this.gridMinX) / this.voxelResolution));
    this.numVoxelsY = Math.max(0, Math.round((numberFromArray(metadata.gridBounds.max, 1) - this.gridMinY) / this.voxelResolution));
    this.numVoxelsZ = Math.max(0, Math.round((numberFromArray(metadata.gridBounds.max, 2) - this.gridMinZ) / this.voxelResolution));
    this.nodes = nodes;
    this.leafData = leafData;
  }

  isWorldSolid(x: number, y: number, z: number, options: VoxelQueryOptions = {}): boolean {
    const ix = Math.floor((x - this.gridMinX) / this.voxelResolution);
    const iy = Math.floor((y - this.gridMinY) / this.voxelResolution);
    const iz = Math.floor((z - this.gridMinZ) / this.voxelResolution);
    return this.isVoxelSolidForQuery(ix, iy, iz, options);
  }

  isVoxelSolid(ix: number, iy: number, iz: number): boolean {
    if (
      this.nodes.length === 0 ||
      ix < 0 || iy < 0 || iz < 0 ||
      ix >= this.numVoxelsX || iy >= this.numVoxelsY || iz >= this.numVoxelsZ
    ) {
      return false;
    }

    const blockX = Math.floor(ix / this.leafSize);
    const blockY = Math.floor(iy / this.leafSize);
    const blockZ = Math.floor(iz / this.leafSize);
    let nodeIndex = 0;

    for (let level = this.treeDepth - 1; level >= 0; level--) {
      const node = this.nodes[nodeIndex] >>> 0;
      if (node === SOLID_LEAF_MARKER) return true;

      const childMask = (node >>> 24) & 0xFF;
      if (childMask === 0) return this.checkLeafByIndex(node, ix, iy, iz);

      const bitX = (blockX >>> level) & 1;
      const bitY = (blockY >>> level) & 1;
      const bitZ = (blockZ >>> level) & 1;
      const octant = (bitZ << 2) | (bitY << 1) | bitX;
      if ((childMask & (1 << octant)) === 0) return false;

      const baseOffset = node & 0x00FFFFFF;
      const prefix = (1 << octant) - 1;
      const childOffset = popcount(childMask & prefix);
      nodeIndex = baseOffset + childOffset;
      if (nodeIndex < 0 || nodeIndex >= this.nodes.length) return false;
    }

    const node = this.nodes[nodeIndex] >>> 0;
    if (node === SOLID_LEAF_MARKER) return true;
    return this.checkLeafByIndex(node, ix, iy, iz);
  }

  queryCapsule(feetX: number, feetY: number, feetZ: number, options: VoxelCapsuleOptions = {}): VoxelCapsuleCollisionResult {
    const radius = finitePositive(options.radius, PLAYER_RADIUS);
    const height = Math.max(radius * 2, finitePositive(options.height, PLAYER_HEIGHT));
    const halfHeight = Math.max(0, (height - radius * 2) / 2);
    const centerY = feetY + height / 2;
    const out = { x: 0, y: 0, z: 0 };
    const collided = resolveIterative(
      feetX,
      centerY,
      feetZ,
      (x, y, z, push) => this.resolveDeepestPenetrationCapsule(x, y, z, halfHeight, radius, push, options),
      this.constraintNormals,
      this.push,
      out
    );

    return {
      collided,
      x: feetX + out.x,
      y: feetY + out.y,
      z: feetZ + out.z,
      pushX: out.x,
      pushY: out.y,
      pushZ: out.z
    };
  }

  private isVoxelSolidForQuery(ix: number, iy: number, iz: number, options: VoxelQueryOptions): boolean {
    if (!this.isVoxelSolid(ix, iy, iz)) return false;
    const erasers = options.erasers ?? [];
    if (erasers.length === 0) return true;

    const centerX = this.gridMinX + (ix + 0.5) * this.voxelResolution;
    const centerY = this.gridMinY + (iy + 0.5) * this.voxelResolution;
    const centerZ = this.gridMinZ + (iz + 0.5) * this.voxelResolution;
    return !pointInsideAnyCollisionBox(centerX, centerY, centerZ, erasers, options.floorY ?? 0);
  }

  private resolveDeepestPenetrationCapsule(
    cx: number,
    cy: number,
    cz: number,
    halfHeight: number,
    radius: number,
    out: PushVector,
    options: VoxelQueryOptions
  ): boolean {
    const radiusSq = radius * radius;
    const segBottomY = cy - halfHeight;
    const segTopY = cy + halfHeight;
    const ixMin = Math.floor((cx - radius - this.gridMinX) / this.voxelResolution);
    const iyMin = Math.floor((segBottomY - radius - this.gridMinY) / this.voxelResolution);
    const izMin = Math.floor((cz - radius - this.gridMinZ) / this.voxelResolution);
    const ixMax = Math.floor((cx + radius - this.gridMinX) / this.voxelResolution);
    const iyMax = Math.floor((segTopY + radius - this.gridMinY) / this.voxelResolution);
    const izMax = Math.floor((cz + radius - this.gridMinZ) / this.voxelResolution);

    let bestPushX = 0;
    let bestPushY = 0;
    let bestPushZ = 0;
    let bestPenetration = PENETRATION_EPSILON;
    let found = false;

    for (let iz = izMin; iz <= izMax; iz++) {
      for (let iy = iyMin; iy <= iyMax; iy++) {
        for (let ix = ixMin; ix <= ixMax; ix++) {
          if (!this.isVoxelSolidForQuery(ix, iy, iz, options)) continue;

          const vMinX = this.gridMinX + ix * this.voxelResolution;
          const vMinY = this.gridMinY + iy * this.voxelResolution;
          const vMinZ = this.gridMinZ + iz * this.voxelResolution;
          const vMaxX = vMinX + this.voxelResolution;
          const vMaxY = vMinY + this.voxelResolution;
          const vMaxZ = vMinZ + this.voxelResolution;
          const segY = closestSegmentYToAabb(segBottomY, segTopY, vMinY, vMaxY);
          const nearX = clamp(cx, vMinX, vMaxX);
          const nearY = clamp(segY, vMinY, vMaxY);
          const nearZ = clamp(cz, vMinZ, vMaxZ);
          const dx = cx - nearX;
          const dy = segY - nearY;
          const dz = cz - nearZ;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq >= radiusSq) continue;

          const push = penetrationPushVector(
            cx,
            segY,
            cz,
            radius,
            distSq,
            dx,
            dy,
            dz,
            vMinX,
            vMinY,
            vMinZ,
            vMaxX,
            vMaxY,
            vMaxZ
          );
          if (push.penetration > bestPenetration) {
            bestPenetration = push.penetration;
            bestPushX = push.x;
            bestPushY = push.y;
            bestPushZ = push.z;
            found = true;
          }
        }
      }
    }

    if (found) {
      out.x = bestPushX;
      out.y = bestPushY;
      out.z = bestPushZ;
    }
    return found;
  }

  private checkLeafByIndex(node: number, ix: number, iy: number, iz: number): boolean {
    const leafDataIndex = node & 0x00FFFFFF;
    const vx = ix & 3;
    const vy = iy & 3;
    const vz = iz & 3;
    const bitIndex = vz * 16 + vy * 4 + vx;
    if (bitIndex < 32) {
      const lo = this.leafData[leafDataIndex * 2] >>> 0;
      return ((lo >>> bitIndex) & 1) === 1;
    }
    const hi = this.leafData[leafDataIndex * 2 + 1] >>> 0;
    return ((hi >>> (bitIndex - 32)) & 1) === 1;
  }
}

export function createVoxelCollisionFromData(metadata: VoxelMetadata, data: ArrayBuffer | Uint32Array): SparseVoxelCollision {
  const words = data instanceof Uint32Array ? data : new Uint32Array(data);
  const nodes = words.slice(0, metadata.nodeCount);
  const leafData = words.slice(metadata.nodeCount, metadata.nodeCount + metadata.leafDataCount);
  return new SparseVoxelCollision(metadata, nodes, leafData);
}

export function resolveVoxelCapsuleCollision(
  collision: SparseVoxelCollision,
  feetX: number,
  feetY: number,
  feetZ: number,
  options: VoxelCapsuleOptions = {}
): VoxelCapsuleCollisionResult {
  return collision.queryCapsule(feetX, feetY, feetZ, options);
}

export function findVoxelLandingSurfaceY(
  collision: SparseVoxelCollision,
  x: number,
  z: number,
  previousY: number,
  nextY: number,
  options: VoxelCapsuleOptions = {}
): number | null {
  const maxY = Math.max(previousY, nextY) + PLAYER_SURFACE_SNAP_TOLERANCE;
  const minY = Math.min(previousY, nextY) - PLAYER_SURFACE_SNAP_TOLERANCE;
  return findHighestVoxelSurfaceY(collision, x, z, minY, maxY, options);
}

export function findVoxelStandingSurfaceY(
  collision: SparseVoxelCollision,
  x: number,
  z: number,
  playerY: number,
  options: VoxelCapsuleOptions = {}
): number | null {
  const snap = PLAYER_SURFACE_SNAP_TOLERANCE;
  return findHighestVoxelSurfaceY(collision, x, z, playerY - snap, playerY + snap, options);
}

export function findVoxelSurfaceBelow(
  collision: SparseVoxelCollision,
  x: number,
  z: number,
  startY: number,
  endY: number,
  options: VoxelCapsuleOptions = {}
): number | null {
  const minY = Math.max(endY, collision.gridMinY - collision.voxelResolution);
  const maxY = startY;
  return findHighestVoxelSurfaceY(collision, x, z, minY, maxY, options);
}

function findHighestVoxelSurfaceY(
  collision: SparseVoxelCollision,
  x: number,
  z: number,
  minY: number,
  maxY: number,
  options: VoxelCapsuleOptions
): number | null {
  const radius = finitePositive(options.radius, PLAYER_RADIUS);
  const res = collision.voxelResolution;
  const ixMin = Math.floor((x - radius - collision.gridMinX) / res);
  const ixMax = Math.floor((x + radius - collision.gridMinX) / res);
  const izMin = Math.floor((z - radius - collision.gridMinZ) / res);
  const izMax = Math.floor((z + radius - collision.gridMinZ) / res);
  const iyMin = Math.floor((minY - collision.gridMinY) / res) - 1;
  const iyMax = Math.floor((maxY - collision.gridMinY) / res);
  let best: number | null = null;

  for (let ix = ixMin; ix <= ixMax; ix++) {
    for (let iz = izMin; iz <= izMax; iz++) {
      const centerX = collision.gridMinX + (ix + 0.5) * res;
      const centerZ = collision.gridMinZ + (iz + 0.5) * res;
      if ((centerX - x) * (centerX - x) + (centerZ - z) * (centerZ - z) > radius * radius) continue;

      for (let iy = iyMax; iy >= iyMin; iy--) {
        if (!collision.isWorldSolid(centerX, collision.gridMinY + (iy + 0.5) * res, centerZ, options)) continue;
        if (collision.isWorldSolid(centerX, collision.gridMinY + (iy + 1.5) * res, centerZ, options)) continue;
        const topY = collision.gridMinY + (iy + 1) * res;
        if (topY < minY || topY > maxY) continue;
        if (best === null || topY > best) best = topY;
        break;
      }
    }
  }

  return best;
}

function pointInsideAnyCollisionBox(
  x: number,
  y: number,
  z: number,
  boxes: ArenaCollisionWall[],
  floorY: number
): boolean {
  return boxes.some((box) => pointInsideCollisionBox(x, y, z, box, floorY));
}

function pointInsideCollisionBox(x: number, y: number, z: number, box: ArenaCollisionWall, floorY: number): boolean {
  const height = Math.max(0.1, box.height);
  if (y < floorY || y > floorY + height) return false;
  const local = worldToBoxLocal(x, z, box);
  return Math.abs(local.x) <= Math.max(0.05, box.width / 2)
    && Math.abs(local.z) <= Math.max(0.05, box.depth / 2);
}

function worldToBoxLocal(x: number, z: number, box: ArenaCollisionWall): { x: number; z: number } {
  const dx = x - box.x;
  const dz = z - box.z;
  const cos = Math.cos(box.rotY);
  const sin = Math.sin(box.rotY);
  return {
    x: dx * cos - dz * sin,
    z: dx * sin + dz * cos
  };
}

function resolveIterative(
  cx: number,
  cy: number,
  cz: number,
  findPenetration: (x: number, y: number, z: number, out: PushVector) => boolean,
  constraintNormals: ConstraintNormal[],
  scratch: PushVector,
  out: PushVector
): boolean {
  let resolvedX = cx;
  let resolvedY = cy;
  let resolvedZ = cz;
  let totalPushX = 0;
  let totalPushY = 0;
  let totalPushZ = 0;
  let hadCollision = false;
  let numNormals = 0;

  for (let iter = 0; iter < MAX_RESOLVE_ITERATIONS; iter++) {
    if (!findPenetration(resolvedX, resolvedY, resolvedZ, scratch)) break;
    hadCollision = true;
    let px = scratch.x;
    let py = scratch.y;
    let pz = scratch.z;

    for (let i = 0; i < numNormals; i++) {
      const normal = constraintNormals[i];
      const dot = px * normal.x + py * normal.y + pz * normal.z;
      if (dot < 0) {
        px -= dot * normal.x;
        py -= dot * normal.y;
        pz -= dot * normal.z;
      }
    }

    const len = Math.sqrt(scratch.x * scratch.x + scratch.y * scratch.y + scratch.z * scratch.z);
    if (len > PENETRATION_EPSILON && numNormals < constraintNormals.length) {
      const normal = constraintNormals[numNormals];
      normal.x = scratch.x / len;
      normal.y = scratch.y / len;
      normal.z = scratch.z / len;
      numNormals++;
    }

    resolvedX += px;
    resolvedY += py;
    resolvedZ += pz;
    totalPushX += px;
    totalPushY += py;
    totalPushZ += pz;
  }

  const totalPushSq = totalPushX * totalPushX + totalPushY * totalPushY + totalPushZ * totalPushZ;
  const hasSignificantPush = hadCollision && totalPushSq > PENETRATION_EPSILON * PENETRATION_EPSILON;
  if (hasSignificantPush) {
    out.x = totalPushX;
    out.y = totalPushY;
    out.z = totalPushZ;
  } else {
    out.x = 0;
    out.y = 0;
    out.z = 0;
  }
  return hasSignificantPush;
}

function penetrationPushVector(
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  distSq: number,
  dx: number,
  dy: number,
  dz: number,
  vMinX: number,
  vMinY: number,
  vMinZ: number,
  vMaxX: number,
  vMaxY: number,
  vMaxZ: number
): PushVector & { penetration: number } {
  if (distSq > 1e-12) {
    const dist = Math.sqrt(distSq);
    const penetration = radius - dist;
    const invDist = 1 / dist;
    return {
      x: dx * invDist * penetration,
      y: dy * invDist * penetration,
      z: dz * invDist * penetration,
      penetration
    };
  }

  const distNegX = cx - vMinX;
  const distPosX = vMaxX - cx;
  const distNegY = cy - vMinY;
  const distPosY = vMaxY - cy;
  const distNegZ = cz - vMinZ;
  const distPosZ = vMaxZ - cz;
  const escapeX = distNegX < distPosX ? -(distNegX + radius) : (distPosX + radius);
  const escapeY = distNegY < distPosY ? -(distNegY + radius) : (distPosY + radius);
  const escapeZ = distNegZ < distPosZ ? -(distNegZ + radius) : (distPosZ + radius);
  const absX = Math.abs(escapeX);
  const absY = Math.abs(escapeY);
  const absZ = Math.abs(escapeZ);

  if (absX <= absY && absX <= absZ) {
    return { x: escapeX, y: 0, z: 0, penetration: absX };
  }
  if (absY <= absZ) {
    return { x: 0, y: escapeY, z: 0, penetration: absY };
  }
  return { x: 0, y: 0, z: escapeZ, penetration: absZ };
}

function closestSegmentYToAabb(segBottomY: number, segTopY: number, minY: number, maxY: number): number {
  if (segTopY < minY) return segTopY;
  if (segBottomY > maxY) return segBottomY;
  return clamp((minY + maxY) / 2, segBottomY, segTopY);
}

function popcount(value: number): number {
  let n = value >>> 0;
  n -= (n >>> 1) & 0x55555555;
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}

function numberFromArray(values: number[] | undefined, index: number): number {
  const value = values?.[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function finitePositive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

