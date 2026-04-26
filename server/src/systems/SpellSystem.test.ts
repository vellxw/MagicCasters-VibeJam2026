import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS } from '../../../shared/types';
import type { SpellId } from '../../../shared/spells';
import {
  applyProjectileDamage,
  createTestPlayer,
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

    const dash = executeSpellCast({
      caster,
      targets: [],
      spellId: 'shadow_dash',
      now: 9000,
      phase: 'PLAYING',
      nextProjectileId: () => 'unused'
    });

    expect(dash.ok).toBe(true);
    expect(dash.kind).toBe('dash');
    expect(caster.z).toBe(-4.5);

    caster.x = ARENA_BOUNDS.maxX - 0.5;
    caster.z = 0;
    caster.rotY = -Math.PI / 2;
    caster.cooldowns.shadow_dash = 0;
    caster.mana = 100;

    executeSpellCast({
      caster,
      targets: [],
      spellId: 'shadow_dash',
      now: 13000,
      phase: 'PLAYING',
      nextProjectileId: () => 'unused'
    });

    expect(caster.x).toBe(ARENA_BOUNDS.maxX);

    expect(applyProjectileDamage(nearTarget, 'ice_bolt')).toEqual({
      damage: 12,
      defeated: false
    });
    expect(nearTarget.hp).toBe(72);
  });
});
