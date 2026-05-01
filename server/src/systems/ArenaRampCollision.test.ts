import { describe, expect, it } from 'vitest';
import {
  findStandingSurfaceY,
  moveWithArenaCollision,
  normalizeCollisionWalls
} from '../../../shared/arenaCollision';
import type { ArenaBounds, ArenaCollisionWall } from '../../../shared/types';

describe('ramp collision walls', () => {
  const bounds: ArenaBounds = { minX: -8, maxX: 8, minZ: -8, maxZ: 8 };
  const ramp: ArenaCollisionWall = {
    id: 'stair-ramp',
    x: 0,
    z: 0,
    width: 4,
    depth: 6,
    height: 1.5,
    rotY: 0,
    ramp: true
  };

  it('normalizes ramp walls from calibration presets', () => {
    expect(normalizeCollisionWalls([{ ...ramp, kind: 'ramp' }])[0]).toMatchObject({
      id: 'stair-ramp',
      ramp: true
    });
  });

  it('uses a ramp wall as an inclined standing surface', () => {
    expect(findStandingSurfaceY(0, -3, 0, 0, [ramp], 0.05, 0.1)).toBeCloseTo(0, 5);
    expect(findStandingSurfaceY(0, 0, 0.75, 0, [ramp], 0.05, 0.1)).toBeCloseTo(0.75, 5);
    expect(findStandingSurfaceY(0, 3, 1.5, 0, [ramp], 0.05, 0.1)).toBeCloseTo(1.5, 5);
  });

  it('does not block horizontal movement like a vertical wall', () => {
    const moved = moveWithArenaCollision(0, -3.4, 0, 3.4, bounds, [ramp], {
      playerY: 0,
      floorY: 0
    });

    expect(moved.z).toBeCloseTo(3.4, 5);
  });
});
