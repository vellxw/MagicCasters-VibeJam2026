import { describe, expect, it } from 'vitest';
import {
  createVoxelCollisionFromData,
  findVoxelLandingSurfaceY,
  resolveVoxelCapsuleCollision
} from '../../../shared/voxelCollision';
import { ARENA_BOUNDS, PLAYER_RADIUS, type ArenaCollisionWall } from '../../../shared/types';
import { createTestPlayer } from './SpellSystem';
import { applyMovement } from './MovementSystem';

const SOLID_LEAF_MARKER = 0xFF000000 >>> 0;

function singleVoxelMask(ix: number, iy: number, iz: number): Uint32Array {
  const bitIndex = iz * 16 + iy * 4 + ix;
  const leafData = new Uint32Array(2);
  if (bitIndex < 32) {
    leafData[0] = (1 << bitIndex) >>> 0;
  } else {
    leafData[1] = (1 << (bitIndex - 32)) >>> 0;
  }
  return leafData;
}

function singleBlockVoxelCollision(solidVoxels: Array<{ x: number; y: number; z: number }>) {
  let lo = 0;
  let hi = 0;
  for (const voxel of solidVoxels) {
    const mask = singleVoxelMask(voxel.x, voxel.y, voxel.z);
    lo |= mask[0];
    hi |= mask[1];
  }

  return createVoxelCollisionFromData({
    version: '1.1',
    gridBounds: { min: [0, 0, 0], max: [4, 4, 4] },
    sceneBounds: { min: [0, 0, 0], max: [4, 4, 4] },
    voxelResolution: 1,
    leafSize: 4,
    treeDepth: 0,
    numInteriorNodes: 0,
    numMixedLeaves: 1,
    nodeCount: 1,
    leafDataCount: 2
  }, new Uint32Array([0, lo >>> 0, hi >>> 0]));
}

describe('voxel collision', () => {
  it('loads sparse voxel data and detects solid voxels', () => {
    const collision = singleBlockVoxelCollision([{ x: 1, y: 0, z: 1 }]);

    expect(collision.isVoxelSolid(1, 0, 1)).toBe(true);
    expect(collision.isVoxelSolid(0, 0, 0)).toBe(false);
    expect(collision.isWorldSolid(1.5, 0.5, 1.5)).toBe(true);
  });

  it('resolves a player capsule away from voxel solids', () => {
    const collision = singleBlockVoxelCollision([{ x: 1, y: 0, z: 1 }]);

    const result = resolveVoxelCapsuleCollision(collision, 1.2, 0, 1.5, {
      radius: PLAYER_RADIUS,
      height: 1.7,
      floorY: 0,
      erasers: []
    });

    expect(result.collided).toBe(true);
    expect(result.x).toBeLessThan(1.2);
  });

  it('does not collide inside a collision eraser zone', () => {
    const collision = singleBlockVoxelCollision([{ x: 1, y: 0, z: 1 }]);
    const eraser: ArenaCollisionWall = {
      id: 'erase-bad-box',
      x: 1.5,
      z: 1.5,
      width: 2,
      depth: 2,
      height: 2,
      rotY: 0
    };

    const result = resolveVoxelCapsuleCollision(collision, 1.2, 0, 1.5, {
      radius: PLAYER_RADIUS,
      height: 1.7,
      floorY: 0,
      erasers: [eraser]
    });

    expect(result.collided).toBe(false);
    expect(result.x).toBe(1.2);
  });

  it('lands on the top surface of voxel collision', () => {
    const collision = singleBlockVoxelCollision([{ x: 1, y: 0, z: 1 }]);

    const landingY = findVoxelLandingSurfaceY(collision, 1.5, 1.5, 1.25, 0.75, {
      radius: PLAYER_RADIUS,
      floorY: 0,
      erasers: []
    });

    expect(landingY).toBe(1);
  });

  it('uses voxel collision in server movement without generating auto walls', () => {
    const player = createTestPlayer('voxel-blocked');
    player.x = 0.2;
    player.y = 0;
    player.z = 1.5;
    player.rotY = -Math.PI / 2;

    applyMovement(player, { forward: true, backward: false, left: false, right: false }, 0.25, {
      bounds: { ...ARENA_BOUNDS },
      floorY: 0,
      spawnPoints: [],
      collisionWalls: [],
      collisionErasers: [],
      voxelCollisionUrl: '/collision/test.voxel.json'
    }, singleBlockVoxelCollision([{ x: 1, y: 0, z: 1 }]));

    expect(player.x).toBeLessThan(0.7);
    expect(player.z).toBeCloseTo(1.5);
  });

  it('lets eraser zones subtract voxel collision during movement', () => {
    const player = createTestPlayer('voxel-erased');
    player.x = 0.2;
    player.y = 0;
    player.z = 1.5;
    player.rotY = -Math.PI / 2;

    applyMovement(player, { forward: true, backward: false, left: false, right: false }, 0.25, {
      bounds: { ...ARENA_BOUNDS },
      floorY: 0,
      spawnPoints: [],
      collisionWalls: [],
      collisionErasers: [
        { id: 'erase', x: 1.5, z: 1.5, width: 2, depth: 2, height: 2, rotY: 0 }
      ],
      voxelCollisionUrl: '/collision/test.voxel.json'
    }, singleBlockVoxelCollision([{ x: 1, y: 0, z: 1 }]));

    expect(player.x).toBeGreaterThan(1);
  });
});

