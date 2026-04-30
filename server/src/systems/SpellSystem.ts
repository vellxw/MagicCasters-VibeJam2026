import { ARENA_BOUNDS, MAX_HP, MAX_MANA, type ArenaCollisionConfig, type PublicProjectileState, type RoomPhase, type TeamId } from '../../../shared/types.js';
import { moveWithArenaCollision } from '../../../shared/arenaCollision.js';
import { isSpellId, SPELLS, type SpellId } from '../../../shared/spells.js';
import type { SparseVoxelCollision } from '../../../shared/voxelCollision.js';

export type CastFailureReason = 'unknown_spell' | 'wrong_phase' | 'defeated' | 'no_mana' | 'cooldown' | 'silenced';

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
  shieldActive?: boolean;
  silencedUntil?: number;
  slowedUntil?: number;
  speedBoostUntil?: number;
  airDashAvailable?: boolean;
  markedUntil?: number;
  rootedUntil?: number;
  explosiveShield?: boolean;
}

export type CastValidation =
  | { ok: true; spellId: SpellId }
  | { ok: false; reason: CastFailureReason };

export type CastResult =
  | { ok: false; reason: CastFailureReason }
  | { ok: true; kind: 'projectile'; spellId: SpellId; projectile: PublicProjectileState }
  | { ok: true; kind: 'instant'; spellId: SpellId; hits: Array<{ targetId: string; damage: number; hp: number }> }
  | { ok: true; kind: 'trap'; spellId: SpellId; trap: { x: number; z: number; radius: number; ownerId: string; spellId: SpellId; expiresAt: number } }
  | { ok: true; kind: 'ground_line'; spellId: SpellId; hits: Array<{ targetId: string; damage: number; hp: number }> };

export interface ExecuteCastArgs {
  caster: ServerPlayer;
  targets: ServerPlayer[];
  spellId: SpellId;
  now: number;
  phase: RoomPhase;
  nextProjectileId: () => string;
  arenaCollision?: ArenaCollisionConfig;
  voxelCollision?: SparseVoxelCollision | null;
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

  if ((player.silencedUntil ?? 0) > now) {
    return { ok: false, reason: 'silenced' };
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

  if (spell.kind === 'instant' || spell.kind === 'dash') {
    const hits: Array<{ targetId: string; damage: number; hp: number }> = [];
    if (spell.kind === 'dash') {
      const direction = directionFromRotation(args.caster.rotY);
      const bounds = args.arenaCollision?.bounds ?? ARENA_BOUNDS;
      const resolved = moveWithArenaCollision(
        args.caster.x,
        args.caster.z,
        args.caster.x + direction.x * spell.range,
        args.caster.z + direction.z * spell.range,
        bounds,
        args.arenaCollision?.collisionWalls ?? [],
        {
          playerY: args.caster.y,
          floorY: args.arenaCollision?.floorY ?? 0,
          voxelCollision: args.voxelCollision ?? null,
          collisionErasers: args.arenaCollision?.collisionErasers ?? []
        }
      );
      args.caster.x = round(clamp(resolved.x, bounds.minX, bounds.maxX));
      args.caster.z = round(clamp(resolved.z, bounds.minZ, bounds.maxZ));
    } else {
      for (const target of args.targets) {
        if (target.id === args.caster.id || target.hp <= 0) continue;
        const distance = Math.hypot(target.x - args.caster.x, target.z - args.caster.z);
        if (distance <= spell.range) {
          const result = applyDamage(target, spell.damage);
          hits.push({ targetId: target.id, damage: result.damage, hp: target.hp });
        }
      }
      if (validation.spellId === 'firmament_shield') {
        args.caster.shieldActive = true;
      }
    }
    return { ok: true, kind: 'instant', spellId: validation.spellId, hits };
  }

  if (spell.kind === 'trap') {
    const trap = {
      x: round(args.caster.x),
      z: round(args.caster.z),
      radius: spell.radius,
      ownerId: args.caster.id,
      spellId: validation.spellId,
      expiresAt: args.now + spell.ttl * 1000
    };
    return { ok: true, kind: 'trap', spellId: validation.spellId, trap };
  }

  if (spell.kind === 'ground_line') {
    const hits = computeGroundLineHits(args.caster, args.targets, spell.range, spell.radius);
    return { ok: true, kind: 'ground_line', spellId: validation.spellId, hits };
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

function computeGroundLineHits(
  caster: ServerPlayer,
  targets: ServerPlayer[],
  range: number,
  halfWidth: number
): Array<{ targetId: string; damage: number; hp: number }> {
  const hits: Array<{ targetId: string; damage: number; hp: number }> = [];
  const dir = directionFromRotation(caster.rotY);
  const originX = caster.x;
  const originZ = caster.z;

  for (const target of targets) {
    if (target.id === caster.id || target.hp <= 0) continue;
    const dx = target.x - originX;
    const dz = target.z - originZ;
    const longitudinal = dx * dir.x + dz * dir.z;
    if (longitudinal < 0 || longitudinal > range) continue;
    const perpX = dx - longitudinal * dir.x;
    const perpZ = dz - longitudinal * dir.z;
    const perpDist = Math.hypot(perpX, perpZ);
    if (perpDist <= halfWidth) {
      const result = applyDamage(target, SPELLS.glacial_spikes.damage);
      hits.push({ targetId: target.id, damage: result.damage, hp: target.hp });
    }
  }

  return hits;
}

export function applyProjectileDamage(target: ServerPlayer, spellId: SpellId): { damage: number; defeated: boolean; shieldBroken: boolean } {
  const spell = SPELLS[spellId];
  const result = applyDamage(target, spell.damage);
  return {
    damage: result.damage,
    defeated: target.hp <= 0,
    shieldBroken: result.shieldBroken
  };
}

export function directionFromRotation(rotY: number): { x: number; z: number } {
  return {
    x: -Math.sin(rotY),
    z: -Math.cos(rotY)
  };
}

export function directionAwayFrom(
  from: { x: number; z: number },
  to: { x: number; z: number }
): { x: number; z: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length <= 0.000001) return { x: 0, z: 0 };
  return { x: round(dx / length), z: round(dz / length) };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function applyDamage(target: ServerPlayer, amount: number): { damage: number; shieldBroken: boolean } {
  if (target.shieldActive) {
    target.shieldActive = false;
    return { damage: 0, shieldBroken: true };
  }
  const before = target.hp;
  target.hp = Math.max(0, target.hp - amount);
  return { damage: before - target.hp, shieldBroken: false };
}

function round(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
