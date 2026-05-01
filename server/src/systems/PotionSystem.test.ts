import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS, MAX_HP, MAX_MANA, type ArenaCollisionConfig } from '../../../shared/types';
import { createTestPlayer } from './SpellSystem';
import {
  POTION_FALL_HEIGHT,
  POTION_GROUNDED_TTL_MS,
  POTION_HEALTH_RESTORE,
  POTION_MANA_RESTORE,
  POTION_MAX_ACTIVE,
  POTION_SPAWN_INTERVAL_MS,
  collectGroundedPotions,
  createPotion,
  randomPotionPosition,
  shouldSpawnPotion,
  updatePotionFall
} from './PotionSystem';

const collision: ArenaCollisionConfig = {
  bounds: { ...ARENA_BOUNDS },
  floorY: 1.5,
  spawnPoints: [
    { x: -5.5, y: 1.5, z: 0, rotY: 0 },
    { x: 5.5, y: 1.5, z: 0, rotY: 0 }
  ],
  collisionWalls: [
    { id: 'center', x: 0, z: 0, width: 2, depth: 2, height: 2, rotY: 0 }
  ]
};

describe('PotionSystem', () => {
  it('spawns potions above the playable floor and lands them before they can expire', () => {
    const potion = createPotion({
      id: 'potion-1',
      type: 'health',
      x: 2,
      z: -1,
      floorY: collision.floorY,
      now: 1000
    });

    expect(potion.state).toBe('falling');
    expect(potion.y).toBe(collision.floorY + POTION_FALL_HEIGHT);

    updatePotionFall(potion, 2, collision.floorY, 3000);

    expect(potion.state).toBe('grounded');
    expect(potion.y).toBe(collision.floorY);
    expect(potion.expiresAt).toBe(3000 + POTION_GROUNDED_TTL_MS);
  });

  it('only lets grounded potions restore players and clamps health and mana', () => {
    const healthPotion = createPotion({ id: 'health-1', type: 'health', x: 0, z: 0, floorY: 0, now: 0 });
    const manaPotion = createPotion({ id: 'mana-1', type: 'mana', x: 3, z: 0, floorY: 0, now: 0 });
    const player = createTestPlayer('collector');
    player.hp = MAX_HP - 5;
    player.mana = MAX_MANA - 3;

    let collected = collectGroundedPotions([healthPotion, manaPotion], [player], 500);

    expect(collected).toEqual([]);
    expect(player.hp).toBe(MAX_HP - 5);
    expect(player.mana).toBe(MAX_MANA - 3);

    updatePotionFall(healthPotion, 2, 0, 1000);
    updatePotionFall(manaPotion, 2, 0, 1000);

    collected = collectGroundedPotions([healthPotion, manaPotion], [player], 1200);
    expect(collected).toEqual([{ potionId: 'health-1', playerId: 'collector', type: 'health', x: 0, y: 0, z: 0 }]);
    expect(player.hp).toBe(MAX_HP);
    expect(player.mana).toBe(MAX_MANA - 3);

    player.x = 3;
    collected = collectGroundedPotions([manaPotion], [player], 1300);
    expect(collected).toEqual([{ potionId: 'mana-1', playerId: 'collector', type: 'mana', x: 3, y: 0, z: 0 }]);
    expect(player.mana).toBe(MAX_MANA);
  });

  it('uses the casual-but-strong spawn cadence and active cap', () => {
    expect(shouldSpawnPotion({ now: 17_999, lastSpawnAt: 0, activeCount: 0 })).toBe(false);
    expect(shouldSpawnPotion({ now: POTION_SPAWN_INTERVAL_MS, lastSpawnAt: 0, activeCount: 0 })).toBe(true);
    expect(shouldSpawnPotion({ now: POTION_SPAWN_INTERVAL_MS, lastSpawnAt: 0, activeCount: POTION_MAX_ACTIVE })).toBe(false);
  });

  it('chooses random playable positions inside bounds while avoiding walls and spawn pads', () => {
    const values = [0.5, 0.5, 0.95, 0.95];
    const position = randomPotionPosition(collision, () => values.shift() ?? 0.95);

    expect(position.x).toBeGreaterThanOrEqual(collision.bounds.minX);
    expect(position.x).toBeLessThanOrEqual(collision.bounds.maxX);
    expect(position.z).toBeGreaterThanOrEqual(collision.bounds.minZ);
    expect(position.z).toBeLessThanOrEqual(collision.bounds.maxZ);
    expect(Math.hypot(position.x, position.z)).toBeGreaterThan(1.5);
    for (const spawn of collision.spawnPoints) {
      expect(Math.hypot(position.x - spawn.x, position.z - spawn.z)).toBeGreaterThan(1.75);
    }
  });

  it('restores the intended strong-but-not-full values before clamping', () => {
    const healthPotion = createPotion({ id: 'health', type: 'health', x: 0, z: 0, floorY: 0, now: 0 });
    const manaPotion = createPotion({ id: 'mana', type: 'mana', x: 3, z: 0, floorY: 0, now: 0 });
    const player = createTestPlayer('collector');
    player.hp = 10;
    player.mana = 10;
    updatePotionFall(healthPotion, 2, 0, 1000);
    updatePotionFall(manaPotion, 2, 0, 1000);

    collectGroundedPotions([healthPotion], [player], 1100);
    player.x = 3;
    collectGroundedPotions([manaPotion], [player], 1200);

    expect(player.hp).toBe(10 + POTION_HEALTH_RESTORE);
    expect(player.mana).toBe(10 + POTION_MANA_RESTORE);
  });
});
