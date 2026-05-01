import {
  MAX_HP,
  MAX_MANA,
  PLAYER_RADIUS,
  type ArenaCollisionConfig
} from '../../../shared/types.js';
import { circleIntersectsWall } from '../../../shared/arenaCollision.js';
import type { ServerPlayer } from './SpellSystem.js';

export type PotionType = 'health' | 'mana';
export type PotionLifecycleState = 'falling' | 'grounded';

export interface ServerPotion {
  id: string;
  type: PotionType;
  x: number;
  y: number;
  z: number;
  state: PotionLifecycleState;
  spawnedAt: number;
  landedAt: number;
  expiresAt: number;
}

export interface PotionCollectedEvent {
  potionId: string;
  playerId: string;
  type: PotionType;
  x: number;
  y: number;
  z: number;
}

export const POTION_SPAWN_INTERVAL_MS = 18_000;
export const POTION_MAX_ACTIVE = 2;
export const POTION_FALL_HEIGHT = 8;
export const POTION_FALL_SPEED = 7;
export const POTION_GROUNDED_TTL_MS = 14_000;
export const POTION_HEALTH_RESTORE = 35;
export const POTION_MANA_RESTORE = 45;
export const POTION_PICKUP_RADIUS = PLAYER_RADIUS + 0.55;
export const POTION_SPAWN_CLEARANCE = 0.9;
export const POTION_SPAWN_PAD_CLEARANCE = 1.75;
export const POTION_SPAWN_ATTEMPTS = 18;

export function shouldSpawnPotion(args: { now: number; lastSpawnAt: number; activeCount: number }): boolean {
  return args.activeCount < POTION_MAX_ACTIVE && args.now - args.lastSpawnAt >= POTION_SPAWN_INTERVAL_MS;
}

export function createPotion(args: {
  id: string;
  type: PotionType;
  x: number;
  z: number;
  floorY: number;
  now: number;
}): ServerPotion {
  return {
    id: args.id,
    type: args.type,
    x: round(args.x),
    y: round(args.floorY + POTION_FALL_HEIGHT),
    z: round(args.z),
    state: 'falling',
    spawnedAt: args.now,
    landedAt: 0,
    expiresAt: 0
  };
}

export function updatePotionFall(potion: ServerPotion, dt: number, floorY: number, now: number): void {
  if (potion.state !== 'falling') return;

  potion.y = round(Math.max(floorY, potion.y - POTION_FALL_SPEED * dt));
  if (potion.y <= floorY) {
    potion.y = floorY;
    potion.state = 'grounded';
    potion.landedAt = now;
    potion.expiresAt = now + POTION_GROUNDED_TTL_MS;
  }
}

export function collectGroundedPotions(
  potions: ServerPotion[],
  players: ServerPlayer[],
  now: number
): PotionCollectedEvent[] {
  const events: PotionCollectedEvent[] = [];
  const collectedPotionIds = new Set<string>();

  for (const potion of potions) {
    if (potion.state !== 'grounded' || potion.expiresAt <= now || collectedPotionIds.has(potion.id)) {
      continue;
    }

    for (const player of players) {
      if (player.hp <= 0) continue;
      const horizontalDistance = Math.hypot(player.x - potion.x, player.z - potion.z);
      if (horizontalDistance > POTION_PICKUP_RADIUS) continue;

      applyPotionEffect(potion.type, player);
      collectedPotionIds.add(potion.id);
      events.push({
        potionId: potion.id,
        playerId: player.id,
        type: potion.type,
        x: potion.x,
        y: potion.y,
        z: potion.z
      });
      break;
    }
  }

  return events;
}

export function potionIsExpired(potion: ServerPotion, now: number): boolean {
  return potion.state === 'grounded' && potion.expiresAt <= now;
}

export function randomPotionType(rng: () => number = Math.random): PotionType {
  return rng() < 0.5 ? 'health' : 'mana';
}

export function randomPotionPosition(
  arenaCollision: ArenaCollisionConfig,
  rng: () => number = Math.random
): { x: number; z: number } {
  const { bounds } = arenaCollision;

  for (let attempt = 0; attempt < POTION_SPAWN_ATTEMPTS; attempt++) {
    const x = lerp(bounds.minX + POTION_SPAWN_CLEARANCE, bounds.maxX - POTION_SPAWN_CLEARANCE, rng());
    const z = lerp(bounds.minZ + POTION_SPAWN_CLEARANCE, bounds.maxZ - POTION_SPAWN_CLEARANCE, rng());
    if (isPotionPositionPlayable(x, z, arenaCollision)) {
      return { x: round(x), z: round(z) };
    }
  }

  return {
    x: round((bounds.minX + bounds.maxX) / 2),
    z: round((bounds.minZ + bounds.maxZ) / 2)
  };
}

function applyPotionEffect(type: PotionType, player: ServerPlayer): void {
  if (type === 'health') {
    player.hp = Math.min(MAX_HP, player.hp + POTION_HEALTH_RESTORE);
    return;
  }

  player.mana = Math.min(MAX_MANA, player.mana + POTION_MANA_RESTORE);
}

function isPotionPositionPlayable(x: number, z: number, arenaCollision: ArenaCollisionConfig): boolean {
  for (const wall of arenaCollision.collisionWalls) {
    if (circleIntersectsWall(x, z, POTION_SPAWN_CLEARANCE, wall)) return false;
  }

  for (const spawn of arenaCollision.spawnPoints) {
    if (Math.hypot(x - spawn.x, z - spawn.z) <= POTION_SPAWN_PAD_CLEARANCE) return false;
  }

  return true;
}

function lerp(min: number, max: number, amount: number): number {
  return min + (max - min) * amount;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
