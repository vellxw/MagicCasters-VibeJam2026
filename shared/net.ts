import type { SpellId } from './spells.js';
import type { MoveInput } from './types.js';

export interface JoinOptions {
  name?: string;
}

export type ClientMessage =
  | { type: 'move'; input: MoveInput }
  | { type: 'cast'; spellId: SpellId };

export type ServerEvent =
  | { type: 'spell_confirmed'; playerId: string; spellId: SpellId; x: number; y: number; z: number }
  | { type: 'cast_denied'; spellId: string; reason: string }
  | { type: 'damage'; targetId: string; amount: number; hp: number }
  | { type: 'phase'; phase: string; message: string };
