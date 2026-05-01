import { BOT_SKILLS, type BotSkill, type MoveInput, type RoomPhase } from '../../../shared/types.js';
import { getSpellIdsForClass, SPELLS, type SpellId } from '../../../shared/spells.js';
import type { ServerPlayer } from './SpellSystem.js';

export interface BotSkillConfig {
  reactionMs: number;
  aimErrorRadians: number;
  preferredRange: number;
  retreatRange: number;
  strafeChance: number;
}

export interface BotControllerState {
  id: string;
  skill: BotSkill;
  nextThinkAt: number;
  nextCastAt: number;
  strafeDirection: -1 | 0 | 1;
  strafeUntil: number;
  aimOffset: number;
}

const BOT_CONFIGS: Record<BotSkill, BotSkillConfig> = {
  novice: {
    reactionMs: 900,
    aimErrorRadians: 0.34,
    preferredRange: 6,
    retreatRange: 1.8,
    strafeChance: 0.2
  },
  adept: {
    reactionMs: 480,
    aimErrorRadians: 0.16,
    preferredRange: 5,
    retreatRange: 2.2,
    strafeChance: 0.48
  },
  master: {
    reactionMs: 260,
    aimErrorRadians: 0.06,
    preferredRange: 4.4,
    retreatRange: 2.6,
    strafeChance: 0.72
  }
};

export function normalizeBotSkill(value: unknown): BotSkill | null {
  return typeof value === 'string' && (BOT_SKILLS as readonly string[]).includes(value)
    ? value as BotSkill
    : null;
}

export function getBotSkillConfig(skill: BotSkill): BotSkillConfig {
  return BOT_CONFIGS[skill];
}

export function createBotController(id: string, skill: BotSkill): BotControllerState {
  return {
    id,
    skill,
    nextThinkAt: 0,
    nextCastAt: 0,
    strafeDirection: 0,
    strafeUntil: 0,
    aimOffset: 0
  };
}

export function chooseBotTarget(bot: ServerPlayer, players: Iterable<ServerPlayer>): ServerPlayer | null {
  let best: ServerPlayer | null = null;
  let bestDistance = Infinity;

  for (const player of players) {
    if (player.id === bot.id || player.teamId === bot.teamId || player.hp <= 0) continue;
    const distance = Math.hypot(player.x - bot.x, player.z - bot.z);
    if (distance < bestDistance) {
      best = player;
      bestDistance = distance;
    }
  }

  return best;
}

export function createBotMoveInput(
  bot: ServerPlayer,
  target: ServerPlayer,
  controller: BotControllerState,
  now: number
): MoveInput {
  const config = BOT_CONFIGS[controller.skill];
  const dx = target.x - bot.x;
  const dz = target.z - bot.z;
  const distance = Math.hypot(dx, dz);

  if (now >= controller.strafeUntil) {
    controller.strafeDirection = shouldStrafe(controller.skill, bot.id, now)
      ? deterministicDirection(bot.id, now)
      : 0;
    controller.strafeUntil = now + config.reactionMs * 2;
    controller.aimOffset = deterministicAimOffset(bot.id, now, config.aimErrorRadians);
  }

  return {
    forward: distance > config.preferredRange,
    backward: distance < config.retreatRange,
    left: controller.strafeDirection < 0,
    right: controller.strafeDirection > 0,
    jump: false,
    dash: false,
    rotY: Math.atan2(-dx, -dz) + controller.aimOffset
  };
}

export function chooseBotSpell(
  bot: ServerPlayer,
  target: ServerPlayer,
  skill: BotSkill,
  now: number,
  phase: RoomPhase
): SpellId | null {
  if (phase !== 'PLAYING' || bot.hp <= 0 || target.hp <= 0) return null;

  const distance = Math.hypot(target.x - bot.x, target.z - bot.z);
  const available = getSpellIdsForClass(bot.characterClass)
    .filter((spellId) => canTrySpell(bot, spellId, distance, now));

  if (available.length === 0) return null;

  if (bot.characterClass === 'arcanist') {
    if (skill !== 'novice' && (target.markedUntil ?? 0) > now && available.includes('abyssal_claw')) {
      return 'abyssal_claw';
    }
    if (skill === 'master' && (target.markedUntil ?? 0) > now && available.includes('eclipse')) {
      return 'eclipse';
    }
    return available.includes('shadow_dart') ? 'shadow_dart' : available[0] ?? null;
  }

  if (bot.characterClass === 'divine') {
    if (bot.hp < 45 && available.includes('firmament_shield')) return 'firmament_shield';
    if (skill !== 'novice' && distance <= SPELLS.penitent_seal.range && available.includes('penitent_seal')) {
      return 'penitent_seal';
    }
    if (skill !== 'novice' && available.includes('glacial_spikes')) return 'glacial_spikes';
    return available.includes('judgment_ray') ? 'judgment_ray' : available[0] ?? null;
  }

  return available[0] ?? null;
}

function canTrySpell(bot: ServerPlayer, spellId: SpellId, distance: number, now: number): boolean {
  const spell = SPELLS[spellId];
  if (bot.mana < spell.manaCost) return false;
  if ((bot.cooldowns[spellId] ?? 0) > now) return false;
  if (spell.range > 0 && distance > spell.range + 0.75) return false;
  return true;
}

function shouldStrafe(skill: BotSkill, id: string, now: number): boolean {
  const chance = BOT_CONFIGS[skill].strafeChance;
  return deterministicUnit(id, now) < chance;
}

function deterministicDirection(id: string, now: number): -1 | 1 {
  return deterministicUnit(`${id}:dir`, now) < 0.5 ? -1 : 1;
}

function deterministicAimOffset(id: string, now: number, maxError: number): number {
  return (deterministicUnit(`${id}:aim`, now) * 2 - 1) * maxError;
}

function deterministicUnit(id: string, now: number): number {
  let hash = 2166136261;
  const bucket = Math.floor(now / 250);
  const text = `${id}:${bucket}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
