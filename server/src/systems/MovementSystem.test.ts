import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS, MAX_MANA, PLAYER_SPEED } from '../../../shared/types';
import { createTestPlayer } from './SpellSystem';
import { applyMovement, regenerateMana } from './MovementSystem';

describe('MovementSystem', () => {
  it('moves relative to aim, normalizes diagonals, and clamps to arena bounds', () => {
    const player = createTestPlayer('runner');
    player.rotY = 0;

    applyMovement(player, { forward: true, backward: false, left: false, right: false }, 1);
    expect(player.x).toBe(0);
    expect(player.z).toBe(-PLAYER_SPEED);

    player.x = 0;
    player.z = 0;
    applyMovement(player, { forward: true, backward: false, left: false, right: true }, 1);
    expect(Math.hypot(player.x, player.z)).toBeCloseTo(PLAYER_SPEED, 5);

    player.x = ARENA_BOUNDS.maxX - 0.1;
    player.z = ARENA_BOUNDS.maxZ - 0.1;
    player.rotY = Math.PI;
    applyMovement(player, { forward: true, backward: false, left: true, right: false }, 1);
    expect(player.x).toBeLessThanOrEqual(ARENA_BOUNDS.maxX);
    expect(player.z).toBeLessThanOrEqual(ARENA_BOUNDS.maxZ);
  });

  it('regenerates mana without exceeding the server cap', () => {
    const player = createTestPlayer('channeler');
    player.mana = MAX_MANA - 1;

    regenerateMana(player, 1);

    expect(player.mana).toBe(MAX_MANA);
  });
});
