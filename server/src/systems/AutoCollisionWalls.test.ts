import { describe, expect, it } from 'vitest';
import {
  clearAutoCollisionWalls,
  isAutoCollisionWall,
  replaceAutoCollisionWalls
} from '../../../shared/autoCollisionWalls';
import type { ArenaCollisionWall } from '../../../shared/types';

function wall(id: string, x = 0): ArenaCollisionWall {
  return { id, x, z: 0, width: 1, depth: 1, height: 1, rotY: 0 };
}

describe('auto collision wall helpers', () => {
  it('recognizes auto-generated walls by id prefix', () => {
    expect(isAutoCollisionWall(wall('auto-box-1'))).toBe(true);
    expect(isAutoCollisionWall(wall('wall-manual-1'))).toBe(false);
  });

  it('replaces only prior auto walls and keeps manual walls intact', () => {
    const existing = [
      wall('wall-manual-1', -1),
      wall('auto-old-1', 0),
      { ...wall('ladder-manual', 1), climbable: true }
    ];

    const next = replaceAutoCollisionWalls(existing, [wall('candidate-a', 2), wall('auto-candidate-b', 3)]);

    expect(next.map((entry) => entry.id)).toEqual([
      'wall-manual-1',
      'ladder-manual',
      'auto-candidate-a',
      'auto-candidate-b'
    ]);
    expect(next[1].climbable).toBe(true);
  });

  it('clears only generated walls', () => {
    const next = clearAutoCollisionWalls([
      wall('auto-one'),
      wall('manual-one'),
      wall('auto-two')
    ]);

    expect(next.map((entry) => entry.id)).toEqual(['manual-one']);
  });
});
