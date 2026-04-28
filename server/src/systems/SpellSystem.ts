import { ARENA_BOUNDS, MAX_HP, MAX_MANA, type PublicProjectileState, type RoomPhase, type TeamId } from '../../../shared/types.js';
import { isSpellId, SPELLS, type SpellId } from '../../../shared/spells.js';

export type CastFailureReason = 'unknown_spell' | 'wrong_phase' | 'defeated' | 'no_mana' | 'cooldown';

export interface ServerPlayer {
  id: string;
  name: string;
  teamId: TeamId;
  x: number;
  y: number;
  z: number;
  rotY: number;
  velocityY?: number;
  hp: number;
  mana: number;
  cooldowns: Partial<Record<SpellId, number>>;
  casting: boolean;
  selectedSpell: string;
}

export type CastValidation =
  | { ok: true; spellId: SpellId }
  | { ok: false; reason: CastFailureReason };

export type CastResult =
  | { ok: false; reason: CastFailureReason }
  | { ok: true; kind: 'projectile'; spellId: SpellId; projectile: PublicProjectileState }
  | { ok: true; kind: 'instant'; spellId: SpellId; hits: Array<{ targetId: string; damage: number; hp: number }> }
  | { ok: true; kind: 'dash'; spellId: SpellId; x: number; z: number };

export interface ExecuteCastArgs {
  caster: ServerPlayer;
  targets: ServerPlayer[];
  spellId: SpellId;
  now: number;
  phase: RoomPhase;
  nextProjectileId: () => string;
}

export function createTestPlayer(id: string, teamId: TeamId = 'A'): ServerPlayer {
  return {
    id,
    name: id,
    teamId,
    x: 0,
    y: 0,
    z: 0,
    rotY: 0,
    velocityY: 0,
    hp: MAX_HP,
    mana: MAX_MANA,
    cooldowns: {},
    casting: false,
    selectedSpell: ''
  };
}

export function validateCast(player: ServerPlayer, spellId: SpellId | string, now: number, phase: RoomPhase): CastValidation {
  if (!isSpellId(spellId)) {
    return { ok: false, reason: 'unknown_spell' };
  }

  if (phase !== 'PLAYING') {
    return { ok: false, reason: 'wrong_phase' };
  }

  if (player.hp <= 0) {
    return { ok: false, reason: 'defeated' };
  }

  const spell = SPELLS[spellId];
  if (player.mana < spell.manaCost) {
    return { ok: false, reason: 'no_mana' };
  }

  if ((player.cooldowns[spellId] ?? 0) > now) {
    return { ok: false, reason: 'cooldown' };
  }

  return { ok: true, spellId };
}

export function executeSpellCast(args: ExecuteCastArgs): CastResult {
  const validation = validateCast(args.caster, args.spellId, args.now, args.phase);
  if (!validation.ok) {
    return validation;
  }

  const spell = SPELLS[validation.spellId];
  args.caster.mana = Math.max(0, args.caster.mana - spell.manaCost);
  args.caster.cooldowns[validation.spellId] = args.now + spell.cooldownMs;
  args.caster.casting = true;
  args.caster.selectedSpell = validation.spellId;

  if (spell.kind === 'dash') {
    const direction = directionFromRotation(args.caster.rotY);
    args.caster.x = clamp(args.caster.x + direction.x * spell.range, ARENA_BOUNDS.minX, ARENA_BOUNDS.maxX);
    args.caster.z = clamp(args.caster.z + direction.z * spell.range, ARENA_BOUNDS.minZ, ARENA_BOUNDS.maxZ);
    return {
      ok: true,
      kind: 'dash',
      spellId: validation.spellId,
      x: args.caster.x,
      z: args.caster.z
    };
  }

  if (spell.kind === 'instant') {
    const hits: Array<{ targetId: string; damage: number; hp: number }> = [];
    for (const target of args.targets) {
      if (target.id === args.caster.id || target.hp <= 0) continue;
      const distance = Math.hypot(target.x - args.caster.x, target.z - args.caster.z);
      if (distance <= spell.range) {
        const damage = applyDamage(target, spell.damage);
        hits.push({ targetId: target.id, damage, hp: target.hp });
      }
    }
    return { ok: true, kind: 'instant', spellId: validation.spellId, hits };
  }

  const direction = directionFromRotation(args.caster.rotY);
  const projectile: PublicProjectileState = {
    id: args.nextProjectileId(),
    ownerId: args.caster.id,
    spellId: validation.spellId,
    x: round(args.caster.x + direction.x * 0.65),
    y: round(args.caster.y + 1),
    z: round(args.caster.z + direction.z * 0.65),
    dirX: round(direction.x),
    dirY: 0,
    dirZ: round(direction.z),
    speed: spell.speed,
    ttl: spell.ttl
  };

  return {
    ok: true,
    kind: 'projectile',
    spellId: validation.spellId,
    projectile
  };
}

export function applyProjectileDamage(target: ServerPlayer, spellId: SpellId): { damage: number; defeated: boolean } {
  const spell = SPELLS[spellId];
  const damage = applyDamage(target, spell.damage);
  return {
    damage,
    defeated: target.hp <= 0
  };
}

export function directionFromRotation(rotY: number): { x: number; z: number } {
  return {
    x: -Math.sin(rotY),
    z: -Math.cos(rotY)
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function applyDamage(target: ServerPlayer, amount: number): number {
  const before = target.hp;
  target.hp = Math.max(0, target.hp - amount);
  return before - target.hp;
}

function round(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
