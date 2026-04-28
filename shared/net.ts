import type { SpellId } from './spells.js';
import type { MatchMode, MoveInput } from './types.js';

export interface JoinOptions {
  name?: string;
  mode?: MatchMode;
}

export type ClientMessage =
  | { type: 'move'; input: MoveInput }
  | { type: 'cast'; spellId: SpellId };

export type ServerEvent =
  | { type: 'spell_confirmed'; playerId: string; spellId: SpellId; x: number; y: number; z: number }
  | { type: 'cast_denied'; spellId: string; reason: string }
  | { type: 'damage'; targetId: string; amount: number; hp: number }
  | {
      type: 'phase';
      phase: string;
      message: string;
      mode?: MatchMode;
      playerCount?: number;
      requiredPlayers?: number;
      maxPlayers?: number;
      arenaId?: string;
      arenaPresetId?: string;
      arenaPresetUrl?: string;
      arenaDisplayName?: string;
      winnerId?: string;
    };
