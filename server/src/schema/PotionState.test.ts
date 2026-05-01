import { describe, expect, it } from 'vitest';
import { GameState } from './GameState';
import { PotionState } from './PotionState';

describe('PotionState', () => {
  it('exposes active potions on the replicated game state', () => {
    const state = new GameState();
    const potion = new PotionState({
      id: 'potion-1',
      type: 'mana',
      x: 1,
      y: 2,
      z: 3,
      state: 'falling',
      spawnedAt: 100,
      landedAt: 0,
      expiresAt: 0
    });

    state.potions.set(potion.id, potion);

    expect(state.potions.get('potion-1')).toMatchObject({
      id: 'potion-1',
      type: 'mana',
      x: 1,
      y: 2,
      z: 3,
      state: 'falling'
    });
  });
});
