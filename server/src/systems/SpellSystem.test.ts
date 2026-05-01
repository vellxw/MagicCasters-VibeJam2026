import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS } from '../../../shared/types';
import type { SpellId } from '../../../shared/spells';
import {
  applyDamage,
  applySpellSlow,
  applyProjectileHitEffects,
  applyProjectileDamage,
  createTestPlayer,
  directionAwayFrom,
  executeSpellCast,
  FIRMAMENT_SHIELD_DURATION_MS,
  MILD_ATTACK_SLOW_MS,
  MILD_ATTACK_SLOW_MULTIPLIER,
  resolveGlacialSpikeHazards,
  STRONG_ATTACK_SLOW_MS,
  STRONG_ATTACK_SLOW_MULTIPLIER,
  validateCast
} from './SpellSystem';

describe('SpellSystem', () => {
  it('rejects cast intents that violate phase, mana, cooldown, or spell id without mutating player', () => {
    const player = createTestPlayer('caster');
    player.mana = 5;
    player.cooldowns.shadow_dart = 0;

    expect(validateCast(player, 'shadow_dart', 1000, 'WAITING')).toEqual({
      ok: false,
      reason: 'wrong_phase'
    });

    expect(validateCast(player, 'shadow_dart', 1000, 'PLAYING')).toEqual({
      ok: false,
      reason: 'no_mana'
    });

    player.mana = 100;
    player.cooldowns.shadow_dart = 2500;
    expect(validateCast(player, 'shadow_dart', 1000, 'PLAYING')).toEqual({
      ok: false,
      reason: 'cooldown'
    });

    expect(validateCast(player, 'not_real' as SpellId, 1000, 'PLAYING')).toEqual({
      ok: false,
      reason: 'unknown_spell'
    });

    expect(player.mana).toBe(100);
  });

  it('charges mana and creates a server-owned shadow_dart projectile along the caster aim', () => {
    const caster = createTestPlayer('caster', 'A', 'arcanist');
    caster.x = 2;
    caster.y = 0;
    caster.z = 3;
    caster.rotY = 0;
    caster.mana = 100;

    const result = executeSpellCast({
      caster,
      targets: [],
      spellId: 'shadow_dart',
      now: 2000,
      phase: 'PLAYING',
      nextProjectileId: () => 'projectile-1'
    });

    expect(result.ok).toBe(true);
    expect(result.kind).toBe('projectile');
    expect(caster.mana).toBe(88);
    expect(caster.cooldowns.shadow_dart).toBe(2700);

    if (result.kind !== 'projectile') throw new Error('expected projectile cast');
    expect(result.projectile).toMatchObject({
      id: 'projectile-1',
      ownerId: 'caster',
      spellId: 'shadow_dart',
      x: 2,
      y: 1,
      z: 2.35,
      dirX: 0,
      dirY: 0,
      dirZ: -1,
      speed: 14,
      ttl: 1.6
    });
  });

  it('rejects spells that do not belong to the caster class', () => {
    const divine = createTestPlayer('divine', 'A', 'divine');
    divine.mana = 100;

    expect(validateCast(divine, 'shadow_dart', 1000, 'PLAYING')).toEqual({
      ok: false,
      reason: 'wrong_class'
    });

    expect(validateCast(divine, 'judgment_ray', 1000, 'PLAYING')).toEqual({
      ok: true,
      spellId: 'judgment_ray'
    });
  });

  it('applies arcanist projectile mark combo only when the projectile hits', () => {
    const caster = createTestPlayer('caster', 'A', 'arcanist');
    const target = createTestPlayer('target', 'B', 'divine');

    const firstHit = applyProjectileHitEffects(caster, target, 'shadow_dart', 1000);

    expect(firstHit.damage).toBe(10);
    expect(target.markedUntil).toBe(4000);
    expect(firstHit.events).toContainEqual({
      type: 'mark_applied',
      targetId: 'target',
      spellId: 'shadow_dart',
      x: 0,
      z: 0
    });

    const comboHit = applyProjectileHitEffects(caster, target, 'abyssal_claw', 1500);

    expect(comboHit.damage).toBe(22);
    expect(target.markedUntil).toBe(0);
    expect(target.silencedUntil).toBe(2300);
    expect(comboHit.events).toContainEqual({
      type: 'mark_consumed',
      targetId: 'target',
      spellId: 'abyssal_claw',
      x: 0,
      z: 0
    });
  });

  it('applies a mild slow when projectile attacks connect', () => {
    const caster = createTestPlayer('caster', 'A', 'arcanist');
    const target = createTestPlayer('target', 'B', 'divine');

    applyProjectileHitEffects(caster, target, 'shadow_dart', 1000);

    expect(target.slowedUntil).toBe(1000 + MILD_ATTACK_SLOW_MS);
    expect(target.slowMultiplier).toBe(MILD_ATTACK_SLOW_MULTIPLIER);
  });

  it('upgrades current slow spells to a stronger slow', () => {
    const target = createTestPlayer('target', 'B', 'arcanist');

    applySpellSlow(target, 'penitent_seal', 1000);

    expect(target.slowedUntil).toBe(1000 + STRONG_ATTACK_SLOW_MS);
    expect(target.slowMultiplier).toBe(STRONG_ATTACK_SLOW_MULTIPLIER);
  });

  it('applies divine projectile bonus against controlled targets at impact time', () => {
    const caster = createTestPlayer('caster', 'A', 'divine');
    const target = createTestPlayer('target', 'B', 'arcanist');
    target.slowedUntil = 2400;

    const result = applyProjectileHitEffects(caster, target, 'judgment_ray', 1200);

    expect(result.damage).toBe(21);
    expect(target.hp).toBe(79);
  });

  it('does not count judgment_ray own new slow as a pre-existing control bonus', () => {
    const caster = createTestPlayer('caster', 'A', 'divine');
    const target = createTestPlayer('target', 'B', 'arcanist');

    const result = applyProjectileHitEffects(caster, target, 'judgment_ray', 1200);

    expect(result.damage).toBe(14);
    expect(target.hp).toBe(86);
    expect(target.slowedUntil).toBe(1200 + MILD_ATTACK_SLOW_MS);
  });

  it('applies authoritative instant spells and projectile damage on the server', () => {
    const caster = createTestPlayer('caster', 'A', 'arcanist');
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
      spellId: 'eclipse',
      now: 5000,
      phase: 'PLAYING',
      nextProjectileId: () => 'unused'
    });

    expect(burst.ok).toBe(true);
    expect(burst.kind).toBe('instant');
    expect(nearTarget.hp).toBe(90);
    expect(farTarget.hp).toBe(100);

    expect(applyProjectileDamage(nearTarget, 'abyssal_claw')).toEqual({
      damage: 14,
      defeated: false,
      shieldBroken: false
    });
    expect(nearTarget.hp).toBe(76);
  });

  it('creates a void_trap when casting trap spell', () => {
    const caster = createTestPlayer('caster');
    caster.x = 1;
    caster.z = 2;
    caster.mana = 100;

    const result = executeSpellCast({
      caster,
      targets: [],
      spellId: 'void_trap',
      now: 3000,
      phase: 'PLAYING',
      nextProjectileId: () => 'unused'
    });

    expect(result.ok).toBe(true);
    expect(result.kind).toBe('trap');
    expect(caster.mana).toBe(84);
    if (result.kind !== 'trap') throw new Error('expected trap');
    expect(result.trap).toMatchObject({
      x: 1,
      z: 2,
      ownerId: 'caster',
      spellId: 'void_trap'
    });
    expect(result.trap.expiresAt).toBe(3000 + 4000);
  });

  it('hits targets in a line with glacial_spikes', () => {
    const caster = createTestPlayer('caster', 'A', 'divine');
    const target = createTestPlayer('target', 'B', 'arcanist');
    const defeated = createTestPlayer('defeated', 'B', 'arcanist');
    caster.x = 0;
    caster.z = 0;
    target.x = 2;
    target.z = -3;
    defeated.x = -2;
    defeated.z = -3;
    defeated.hp = 0;

    const result = executeSpellCast({
      caster,
      targets: [target, defeated],
      spellId: 'glacial_spikes',
      now: 1000,
      phase: 'PLAYING',
      nextProjectileId: () => 'unused'
    });

    expect(result.ok).toBe(true);
    expect(result.kind).toBe('delayed_area');
    if (result.kind !== 'delayed_area') throw new Error('expected delayed_area');
    expect(result.hazards).toEqual([
      {
        id: 'glacial_caster_target_1000',
        casterId: 'caster',
        targetId: 'target',
        x: 2,
        z: -3,
        radius: 1.15,
        resolvesAt: 1850
      }
    ]);
    expect(target.hp).toBe(100);
  });

  it('resolves glacial_spikes only if the target stays in the telegraph and knocks back with collision', () => {
    const caster = createTestPlayer('caster', 'A', 'divine');
    const hitTarget = createTestPlayer('hit', 'B', 'arcanist');
    const dodgedTarget = createTestPlayer('dodged', 'B', 'arcanist');
    caster.x = 0;
    caster.z = 0;
    hitTarget.x = 1;
    hitTarget.z = -1;
    dodgedTarget.x = -1;
    dodgedTarget.z = -1;

    const cast = executeSpellCast({
      caster,
      targets: [hitTarget, dodgedTarget],
      spellId: 'glacial_spikes',
      now: 1000,
      phase: 'PLAYING',
      nextProjectileId: () => 'unused'
    });
    if (cast.kind !== 'delayed_area') throw new Error('expected delayed_area');

    dodgedTarget.x = -3;
    const result = resolveGlacialSpikeHazards({
      caster,
      targets: [hitTarget, dodgedTarget],
      hazards: cast.hazards,
      now: 1850,
      arenaCollision: {
        bounds: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 },
        floorY: 0,
        spawnPoints: [],
        voxelCollisionUrl: null,
        collisionErasers: [],
        collisionWalls: []
      },
      voxelCollision: null
    });

    expect(result.hits).toEqual([{ targetId: 'hit', amount: 18, hp: 82 }]);
    expect(hitTarget.hp).toBe(82);
    expect(hitTarget.x).toBeGreaterThan(1);
    expect(hitTarget.x).toBeLessThanOrEqual(2);
    expect(dodgedTarget.hp).toBe(100);
  });

  it('roots controlled targets when glacial_spikes erupts', () => {
    const caster = createTestPlayer('caster', 'A', 'divine');
    const target = createTestPlayer('target', 'B', 'arcanist');
    target.x = 0.5;
    target.z = -0.5;
    target.slowedUntil = 3000;

    const cast = executeSpellCast({
      caster,
      targets: [target],
      spellId: 'glacial_spikes',
      now: 1000,
      phase: 'PLAYING',
      nextProjectileId: () => 'unused'
    });
    if (cast.kind !== 'delayed_area') throw new Error('expected delayed_area');

    resolveGlacialSpikeHazards({
      caster,
      targets: [target],
      hazards: cast.hazards,
      now: 1850
    });

    expect(target.rootedUntil).toBe(2350);
  });

  it('activates shieldActive with firmament_shield', () => {
    const caster = createTestPlayer('caster', 'A', 'divine');
    caster.mana = 100;
    const result = executeSpellCast({
      caster,
      targets: [],
      spellId: 'firmament_shield',
      now: 1000,
      phase: 'PLAYING',
      nextProjectileId: () => 'unused'
    });
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('instant');
    expect(caster.shieldActive).toBe(true);
    expect(caster.shieldExpiresAt).toBe(1000 + FIRMAMENT_SHIELD_DURATION_MS);
  });

  it('absorbs damage when shieldActive is true', () => {
    const target = createTestPlayer('target');
    target.shieldActive = true;
    target.shieldExpiresAt = 7000;
    const result = applyDamage(target, 20, 3000);
    expect(result.damage).toBe(0);
    expect(result.shieldBroken).toBe(true);
    expect(target.shieldActive).toBe(false);
    expect(target.shieldExpiresAt).toBe(0);
    expect(target.hp).toBe(100);
  });

  it('lets damage through after firmament_shield expires', () => {
    const target = createTestPlayer('target');
    target.shieldActive = true;
    target.shieldExpiresAt = 6000;

    const result = applyDamage(target, 20, 6001);

    expect(result.damage).toBe(20);
    expect(result.shieldBroken).toBe(false);
    expect(target.shieldActive).toBe(false);
    expect(target.hp).toBe(80);
  });

  it('computes horizontal knockback away from the caster', () => {
    expect(directionAwayFrom({ x: 0, z: 0 }, { x: 0, z: -3 })).toEqual({ x: 0, z: -1 });
    expect(directionAwayFrom({ x: 0, z: 0 }, { x: 4, z: 0 })).toEqual({ x: 1, z: 0 });
  });
});

