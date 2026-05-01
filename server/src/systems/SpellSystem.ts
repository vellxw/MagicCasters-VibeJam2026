import { ARENA_BOUNDS, MAX_HP, MAX_MANA, type ArenaCollisionConfig, type PublicProjectileState, type RoomPhase, type TeamId } from '../../../shared/types.js';
import { moveWithArenaCollision } from '../../../shared/arenaCollision.js';
import { isSpellAvailableToClass, isSpellId, SPELLS, type SpellId } from '../../../shared/spells.js';
import type { CharacterClass } from '../../../shared/classes.js';
import type { SparseVoxelCollision } from '../../../shared/voxelCollision.js';

export type CastFailureReason = 'unknown_spell' | 'wrong_class' | 'wrong_phase' | 'defeated' | 'no_mana' | 'cooldown' | 'silenced';

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
  characterClass: CharacterClass;
  shieldActive?: boolean;
  shieldExpiresAt?: number;
  silencedUntil?: number;
  slowedUntil?: number;
  slowMultiplier?: number;
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
  | { ok: true; kind: 'ground_line'; spellId: SpellId; hits: Array<{ targetId: string; damage: number; hp: number }> }
  | { ok: true; kind: 'delayed_area'; spellId: SpellId; hazards: GlacialSpikeHazard[] };

export interface GlacialSpikeHazard {
  id: string;
  casterId: string;
  targetId: string;
  x: number;
  z: number;
  radius: number;
  resolvesAt: number;
}

export interface GlacialSpikeResolveResult {
  hits: Array<{ targetId: string; amount: number; hp: number }>;
  eruptedHazards: Array<{ id: string; x: number; z: number; radius: number; hitTargetIds: string[] }>;
}

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

export type SpellSideEffectEvent =
  | { type: 'mark_applied'; targetId: string; spellId: SpellId; x: number; z: number }
  | { type: 'mark_consumed'; targetId: string; spellId: SpellId; x: number; z: number };

export interface ProjectileHitResult {
  damage: number;
  defeated: boolean;
  shieldBroken: boolean;
  events: SpellSideEffectEvent[];
}

export const FIRMAMENT_SHIELD_DURATION_MS = 5000;
export const MILD_ATTACK_SLOW_MS = 900;
export const MILD_ATTACK_SLOW_MULTIPLIER = 0.82;
export const STRONG_ATTACK_SLOW_MS = 2400;
export const STRONG_ATTACK_SLOW_MULTIPLIER = 0.22;

export function createTestPlayer(id: string, teamId: TeamId = 'A', characterClass: CharacterClass = 'arcanist'): ServerPlayer {
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
    selectedSpell: '',
    characterClass,
    shieldExpiresAt: 0,
    slowedUntil: 0,
    slowMultiplier: 1
  };
}

export function validateCast(player: ServerPlayer, spellId: SpellId | string, now: number, phase: RoomPhase): CastValidation {
  if (!isSpellId(spellId)) {
    return { ok: false, reason: 'unknown_spell' };
  }

  if (!isSpellAvailableToClass(spellId, player.characterClass)) {
    return { ok: false, reason: 'wrong_class' };
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
          const result = applyDamage(target, spell.damage, args.now);
          if (!result.shieldBroken) applySpellSlow(target, validation.spellId, args.now);
          hits.push({ targetId: target.id, damage: result.damage, hp: target.hp });
        }
      }
      if (validation.spellId === 'firmament_shield') {
        args.caster.shieldActive = true;
        args.caster.shieldExpiresAt = args.now + FIRMAMENT_SHIELD_DURATION_MS;
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
    const hits = computeGroundLineHits(args.caster, args.targets, validation.spellId, spell.range, spell.radius, args.now);
    return { ok: true, kind: 'ground_line', spellId: validation.spellId, hits };
  }

  if (spell.kind === 'delayed_area') {
    const hazards = createGlacialSpikeHazards(args.caster, args.targets, args.now);
    return { ok: true, kind: 'delayed_area', spellId: validation.spellId, hazards };
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
  spellId: SpellId,
  range: number,
  halfWidth: number,
  now: number
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
      const result = applyDamage(target, SPELLS[spellId].damage, now);
      if (!result.shieldBroken) applySpellSlow(target, spellId, now);
      hits.push({ targetId: target.id, damage: result.damage, hp: target.hp });
    }
  }

  return hits;
}

export function applyProjectileDamage(target: ServerPlayer, spellId: SpellId, now = Date.now()): { damage: number; defeated: boolean; shieldBroken: boolean } {
  const spell = SPELLS[spellId];
  const result = applyDamage(target, spell.damage, now);
  return {
    damage: result.damage,
    defeated: target.hp <= 0,
    shieldBroken: result.shieldBroken
  };
}

export function createGlacialSpikeHazards(
  caster: ServerPlayer,
  targets: ServerPlayer[],
  now: number
): GlacialSpikeHazard[] {
  const spell = SPELLS.glacial_spikes;
  return targets
    .filter((target) => target.id !== caster.id && target.hp > 0)
    .map((target) => ({
      id: `glacial_${caster.id}_${target.id}_${now}`,
      casterId: caster.id,
      targetId: target.id,
      x: round(target.x),
      z: round(target.z),
      radius: spell.radius,
      resolvesAt: now + spell.ttl * 1000
    }));
}

export function resolveGlacialSpikeHazards(args: {
  caster: ServerPlayer;
  targets: ServerPlayer[];
  hazards: GlacialSpikeHazard[];
  now: number;
  arenaCollision?: ArenaCollisionConfig;
  voxelCollision?: SparseVoxelCollision | null;
}): GlacialSpikeResolveResult {
  const hits: GlacialSpikeResolveResult['hits'] = [];
  const eruptedHazards: GlacialSpikeResolveResult['eruptedHazards'] = [];
  const hitTargetIds = new Set<string>();
  const targetsById = new Map(args.targets.map((target) => [target.id, target]));
  const bounds = args.arenaCollision?.bounds ?? ARENA_BOUNDS;
  const walls = args.arenaCollision?.collisionWalls ?? [];
  const floorY = args.arenaCollision?.floorY ?? 0;
  const collisionErasers = args.arenaCollision?.collisionErasers ?? [];

  for (const hazard of args.hazards) {
    if (hazard.resolvesAt > args.now) continue;
    const target = targetsById.get(hazard.targetId);
    const hazardHits: string[] = [];

    if (target && target.hp > 0 && !hitTargetIds.has(target.id)) {
      const distance = Math.hypot(target.x - hazard.x, target.z - hazard.z);
      if (distance <= hazard.radius) {
        const wasControlled = (target.silencedUntil ?? 0) > args.now || (target.slowedUntil ?? 0) > args.now;
        const damage = applyDamage(target, SPELLS.glacial_spikes.damage, args.now);
        if (!damage.shieldBroken) applySpellSlow(target, 'glacial_spikes', args.now);
        if (wasControlled) {
          target.rootedUntil = args.now + 500;
        }
        const knockDir = directionAwayFrom({ x: hazard.x, z: hazard.z }, target);
        const fallbackDir = directionAwayFrom(args.caster, target);
        const dir = knockDir.x !== 0 || knockDir.z !== 0 ? knockDir : fallbackDir;
        const resolved = moveWithArenaCollision(
          target.x,
          target.z,
          target.x + dir.x * 1.8,
          target.z + dir.z * 1.8,
          bounds,
          walls,
          {
            playerY: target.y,
            floorY,
            voxelCollision: args.voxelCollision ?? null,
            collisionErasers
          }
        );
        target.x = round(clamp(resolved.x, bounds.minX, bounds.maxX));
        target.z = round(clamp(resolved.z, bounds.minZ, bounds.maxZ));
        hits.push({ targetId: target.id, amount: damage.damage, hp: target.hp });
        hazardHits.push(target.id);
        hitTargetIds.add(target.id);
      }
    }

    eruptedHazards.push({
      id: hazard.id,
      x: hazard.x,
      z: hazard.z,
      radius: hazard.radius,
      hitTargetIds: hazardHits
    });
  }

  return { hits, eruptedHazards };
}

export function applyProjectileHitEffects(
  caster: ServerPlayer,
  target: ServerPlayer,
  spellId: SpellId,
  now: number
): ProjectileHitResult {
  const base = applyProjectileDamage(target, spellId, now);
  const events: SpellSideEffectEvent[] = [];
  let damage = base.damage;
  const wasControlled = (target.silencedUntil ?? 0) > now || (target.slowedUntil ?? 0) > now;

  if (base.shieldBroken) {
    return {
      damage,
      defeated: target.hp <= 0,
      shieldBroken: true,
      events
    };
  }

  applySpellSlow(target, spellId, now);

  if (caster.characterClass === 'arcanist') {
    if (spellId === 'shadow_dart') {
      target.markedUntil = now + 3000;
      events.push({
        type: 'mark_applied',
        targetId: target.id,
        spellId,
        x: round(target.x),
        z: round(target.z)
      });
    }

    if (spellId === 'abyssal_claw' && (target.markedUntil ?? 0) > now) {
      target.markedUntil = 0;
      const bonus = applyDamage(target, 8, now);
      damage += bonus.damage;
      target.silencedUntil = now + 800;
      events.push({
        type: 'mark_consumed',
        targetId: target.id,
        spellId,
        x: round(target.x),
        z: round(target.z)
      });
    }
  }

  if (
    caster.characterClass === 'divine' &&
    spellId === 'judgment_ray' &&
    wasControlled
  ) {
    const bonus = applyDamage(target, 7, now);
    damage += bonus.damage;
  }

  return {
    damage,
    defeated: target.hp <= 0,
    shieldBroken: base.shieldBroken,
    events
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

export function applySpellSlow(target: ServerPlayer, spellId: SpellId, now: number): void {
  if (spellId === 'firmament_shield') return;
  if (spellId === 'penitent_seal' || spellId === 'glacial_spikes') {
    applySlow(target, now, STRONG_ATTACK_SLOW_MS, STRONG_ATTACK_SLOW_MULTIPLIER);
    return;
  }
  applySlow(target, now, MILD_ATTACK_SLOW_MS, MILD_ATTACK_SLOW_MULTIPLIER);
}

export function applyMildAttackSlow(target: ServerPlayer, now: number): void {
  applySlow(target, now, MILD_ATTACK_SLOW_MS, MILD_ATTACK_SLOW_MULTIPLIER);
}

export function refreshShieldState(target: ServerPlayer, now: number): void {
  if (!target.shieldActive) return;
  const expiresAt = target.shieldExpiresAt ?? 0;
  if (expiresAt > 0 && now >= expiresAt) {
    target.shieldActive = false;
    target.shieldExpiresAt = 0;
    target.explosiveShield = false;
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function applyDamage(target: ServerPlayer, amount: number, now = Date.now()): { damage: number; shieldBroken: boolean } {
  refreshShieldState(target, now);
  if (target.shieldActive) {
    target.shieldActive = false;
    target.shieldExpiresAt = 0;
    return { damage: 0, shieldBroken: true };
  }
  const before = target.hp;
  target.hp = Math.max(0, target.hp - amount);
  return { damage: before - target.hp, shieldBroken: false };
}

function applySlow(target: ServerPlayer, now: number, durationMs: number, multiplier: number): void {
  const currentUntil = target.slowedUntil ?? 0;
  const slowIsActive = currentUntil > now;
  const currentMultiplier = slowIsActive ? target.slowMultiplier ?? 1 : 1;
  target.slowedUntil = Math.max(slowIsActive ? currentUntil : now, now + durationMs);
  target.slowMultiplier = Math.min(currentMultiplier, multiplier);
}

function round(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}
