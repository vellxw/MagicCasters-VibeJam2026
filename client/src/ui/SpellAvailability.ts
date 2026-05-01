import { SPELLS, type SpellId } from '../../../shared/spells';
import type { PlayerSnapshot } from '../player/LocalPlayerController';

export type SpellBlockReason =
  | 'ready'
  | 'no_player'
  | 'defeated'
  | 'wrong_phase'
  | 'silenced'
  | 'cooldown'
  | 'no_mana';

export interface SpellAvailability {
  canCast: boolean;
  reason: SpellBlockReason;
  label: string;
  remainingMs: number;
  cooldownProgress: number;
}

export type CombatStatusId = 'marked' | 'silenced' | 'slowed' | 'rooted' | 'shielded';

export interface CombatStatusEffect {
  id: CombatStatusId;
  label: string;
  remainingMs: number;
}

export function getSpellAvailability(args: {
  player?: PlayerSnapshot;
  spellId: SpellId;
  phase: string;
  now?: number;
}): SpellAvailability {
  const now = args.now ?? Date.now();
  const spell = SPELLS[args.spellId];
  const player = args.player;
  const readyAt = player ? cooldownFor(player, args.spellId) : 0;
  const remainingMs = Math.max(0, readyAt - now);
  const cooldownProgress = remainingMs > 0
    ? 1 - Math.min(1, remainingMs / spell.cooldownMs)
    : 1;

  if (!player) {
    return blocked('no_player', 'Waiting', 0, cooldownProgress);
  }

  if (player.hp <= 0) {
    return blocked('defeated', 'Defeated', 0, cooldownProgress);
  }

  if (args.phase !== 'PLAYING') {
    return blocked('wrong_phase', 'Waiting', 0, cooldownProgress);
  }

  if ((player.silencedUntil ?? 0) > now) {
    return blocked('silenced', 'Silenced', player.silencedUntil! - now, cooldownProgress);
  }

  if (remainingMs > 0) {
    return blocked('cooldown', `Cooldown ${formatSeconds(remainingMs)}`, remainingMs, cooldownProgress);
  }

  if (player.mana < spell.manaCost) {
    return blocked('no_mana', 'Need mana', 0, cooldownProgress);
  }

  return {
    canCast: true,
    reason: 'ready',
    label: 'Ready',
    remainingMs: 0,
    cooldownProgress: 1
  };
}

export function getActiveStatusEffects(player: PlayerSnapshot | undefined, now = Date.now()): CombatStatusEffect[] {
  if (!player) return [];
  const effects: CombatStatusEffect[] = [];
  pushTimedEffect(effects, 'marked', 'Marked', player.markedUntil, now);
  pushTimedEffect(effects, 'silenced', 'Silenced', player.silencedUntil, now);
  pushTimedEffect(effects, 'slowed', 'Slowed', player.slowedUntil, now);
  pushTimedEffect(effects, 'rooted', 'Rooted', player.rootedUntil, now);
  if (player.shieldActive) {
    effects.push({ id: 'shielded', label: 'Shield', remainingMs: 0 });
  }
  return effects;
}

export function formatStatusTime(remainingMs: number): string {
  if (remainingMs <= 0) return '';
  return formatSeconds(remainingMs);
}

export function formatCastBlockMessage(availability: SpellAvailability): string {
  switch (availability.reason) {
    case 'silenced':
      return 'Silenced: abilities locked';
    case 'cooldown':
      return availability.label;
    case 'no_mana':
      return 'Not enough mana';
    case 'wrong_phase':
      return 'Wait for the duel';
    case 'defeated':
      return 'Defeated';
    case 'no_player':
      return 'Waiting for mage';
    case 'ready':
      return 'Ready';
  }
}

export function formatCastDeniedReason(reason: unknown): string {
  switch (reason) {
    case 'silenced':
      return 'Silenced: abilities locked';
    case 'cooldown':
      return 'Cooldown';
    case 'no_mana':
      return 'Not enough mana';
    case 'wrong_phase':
      return 'Wait for the duel';
    case 'wrong_class':
      return 'Wrong class';
    case 'defeated':
      return 'Defeated';
    case 'unknown_spell':
      return 'Unknown spell';
    default:
      return typeof reason === 'string' && reason ? reason : 'Cast denied';
  }
}

function blocked(
  reason: Exclude<SpellBlockReason, 'ready'>,
  label: string,
  remainingMs: number,
  cooldownProgress: number
): SpellAvailability {
  return {
    canCast: false,
    reason,
    label,
    remainingMs: Math.max(0, Math.ceil(remainingMs)),
    cooldownProgress
  };
}

function pushTimedEffect(
  effects: CombatStatusEffect[],
  id: Exclude<CombatStatusId, 'shielded'>,
  label: string,
  until: number | undefined,
  now: number
): void {
  if ((until ?? 0) <= now) return;
  effects.push({ id, label, remainingMs: Math.ceil((until ?? 0) - now) });
}

function cooldownFor(player: PlayerSnapshot, spellId: SpellId): number {
  switch (spellId) {
    case 'shadow_dart':
      return player.shadowDartReadyAt ?? 0;
    case 'void_trap':
      return player.voidTrapReadyAt ?? 0;
    case 'abyssal_claw':
      return player.abyssalClawReadyAt ?? 0;
    case 'eclipse':
      return player.eclipseReadyAt ?? 0;
    case 'judgment_ray':
      return player.judgmentRayReadyAt ?? 0;
    case 'penitent_seal':
      return player.penitentSealReadyAt ?? 0;
    case 'glacial_spikes':
      return player.glacialSpikesReadyAt ?? 0;
    case 'firmament_shield':
      return player.firmamentShieldReadyAt ?? 0;
  }
}

function formatSeconds(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  return seconds >= 10 ? `${Math.ceil(seconds)}s` : `${seconds.toFixed(1)}s`;
}
