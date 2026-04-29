import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS } from '../../../shared/types';
import type { SpellId } from '../../../shared/spells';
import {
  applyProjectileDamage,
  createTestPlayer,
  directionAwayFrom,
  executeSpellCast,
  validateCast
} from './SpellSystem';

describe('SpellSystem', () => {
  it('rejects cast intents that violate phase, mana, cooldown, or spell id without mutating player', () => {
    const player = createTestPlayer('caster');
    player.mana = 5;
    player.cooldowns.fireball = 0;

    expect(validateCast(player, 'fireball', 1000, 'WAITING')).toEqual({
      ok: false,
      reason: 'wrong_phase'
    });

    expect(validateCast(player, 'fireball', 1000, 'PLAYING')).toEqual({
      ok: false,
      reason: 'no_mana'
    });

    player.mana = 100;
    player.cooldowns.fireball = 2500;
    expect(validateCast(player, 'fireball', 1000, 'PLAYING')).toEqual({
      ok: false,
      reason: 'cooldown'
    });

    expect(validateCast(player, 'not_real' as SpellId, 1000, 'PLAYING')).toEqual({
      ok: false,
      reason: 'unknown_spell'
    });

    expect(player.mana).toBe(100);
  });

  it('charges mana and creates a server-owned fireball projectile along the caster aim', () => {
    const caster = createTestPlayer('caster');
    caster.x = 2;
    caster.y = 0;
    caster.z = 3;
    caster.rotY = 0;
    caster.mana = 100;

    const result = executeSpellCast({
      caster,
      targets: [],
      spellId: 'fireball',
      now: 2000,
      phase: 'PLAYING',
      nextProjectileId: () => 'projectile-1'
    });

    expect(result.ok).toBe(true);
    expect(result.kind).toBe('projectile');
    expect(caster.mana).toBe(82);
    expect(caster.cooldowns.fireball).toBe(2800);

    if (result.kind !== 'projectile') throw new Error('expected projectile cast');
    expect(result.projectile).toMatchObject({
      id: 'projectile-1',
      ownerId: 'caster',
      spellId: 'fireball',
      x: 2,
      y: 1,
      z: 2.35,
      dirX: 0,
      dirY: 0,
      dirZ: -1,
      speed: 13,
      ttl: 1.6
    });
  });

  it('applies authoritative instant spells and projectile damage on the server', () => {
    const caster = createTestPlayer('caster');
    const nearTarget = createTestPlayer('near');
    const farTarget = createTestPlayer('far');
    caster.x = 0;
    caster.z = 0;
    caster.rotY = 0;
    nearTarget.x = 0;
    nearTarget.z = -3.2;
    farTarget.x = 0;
    farTarget.z = 6;

    const burst = executeSpellCast({
      caster,
      targets: [nearTarget, farTarget],
      spellId: 'light_burst',
      now: 5000,
      phase: 'PLAYING',
      nextProjectileId: () => 'unused'
    });

    expect(burst.ok).toBe(true);
    expect(burst.kind).toBe('instant');
    expect(nearTarget.hp).toBe(84);
    expect(farTarget.hp).toBe(100);

    expect(applyProjectileDamage(nearTarget, 'ice_bolt')).toEqual({
      damage: 12,
      defeated: false
    });
    expect(nearTarget.hp).toBe(72);
  });

  it('moves the caster forward when casting shadow dash', () => {
    const caster = createTestPlayer('caster');
    caster.x = 0;
    caster.z = 0;
    caster.rotY = 0;
    caster.mana = 100;

    const result = executeSpellCast({
      caster,
      targets: [],
      spellId: 'shadow_dash',
      now: 7000,
      phase: 'PLAYING',
      nextProjectileId: () => 'unused'
    });

    expect(result.ok).toBe(true);
    expect(result.kind).toBe('instant');
    expect(caster.mana).toBe(86);
    expect(caster.cooldowns.shadow_dash).toBe(8600);
    expect(caster.x).toBe(0);
    expect(caster.z).toBe(-3.2);
  });

  it('keeps shadow dash outside arena collision walls', () => {
    const caster = createTestPlayer('blocked-dasher');
    caster.x = 0;
    caster.z = 1.2;
    caster.rotY = 0;
    caster.mana = 100;

    const result = executeSpellCast({
      caster,
      targets: [],
      spellId: 'shadow_dash',
      now: 8000,
      phase: 'PLAYING',
      nextProjectileId: () => 'unused',
      arenaCollision: {
        bounds: { ...ARENA_BOUNDS },
        floorY: 0,
        spawnPoints: [],
        collisionWalls: [
          { id: 'dash-wall', x: 0, z: 0, width: 4, depth: 0.5, height: 2, rotY: 0 }
        ]
      }
    });

    expect(result.ok).toBe(true);
    expect(caster.z).toBeGreaterThanOrEqual(0.69);
  });

  it('computes horizontal knockback away from the caster', () => {
    expect(directionAwayFrom({ x: 0, z: 0 }, { x: 0, z: -3 })).toEqual({ x: 0, z: -1 });
    expect(directionAwayFrom({ x: 0, z: 0 }, { x: 4, z: 0 })).toEqual({ x: 1, z: 0 });
  });
});
