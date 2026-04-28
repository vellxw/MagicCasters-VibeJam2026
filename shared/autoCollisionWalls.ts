import type { ArenaCollisionWall } from './types.js';

export const AUTO_COLLISION_WALL_PREFIX = 'auto-';

export function isAutoCollisionWall(wall: Pick<ArenaCollisionWall, 'id'>): boolean {
  return wall.id.startsWith(AUTO_COLLISION_WALL_PREFIX);
}

export function clearAutoCollisionWalls(walls: ArenaCollisionWall[]): ArenaCollisionWall[] {
  return walls.filter((wall) => !isAutoCollisionWall(wall)).map(cloneWall);
}

export function replaceAutoCollisionWalls(
  existingWalls: ArenaCollisionWall[],
  generatedWalls: ArenaCollisionWall[]
): ArenaCollisionWall[] {
  return [
    ...clearAutoCollisionWalls(existingWalls),
    ...generatedWalls.map((wall, index) => markAutoCollisionWall(wall, index))
  ];
}

export function countAutoCollisionWalls(walls: Array<Pick<ArenaCollisionWall, 'id'>>): number {
  return walls.filter(isAutoCollisionWall).length;
}

function markAutoCollisionWall(wall: ArenaCollisionWall, index: number): ArenaCollisionWall {
  const cleanId = wall.id.startsWith(AUTO_COLLISION_WALL_PREFIX)
    ? wall.id.slice(AUTO_COLLISION_WALL_PREFIX.length)
    : wall.id;
  const fallback = `wall-${index + 1}`;
  const suffix = cleanId.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
  return {
    ...cloneWall(wall),
    id: `${AUTO_COLLISION_WALL_PREFIX}${suffix}`,
    climbable: false
  };
}

function cloneWall(wall: ArenaCollisionWall): ArenaCollisionWall {
  return { ...wall };
}
