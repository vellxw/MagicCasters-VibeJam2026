import type { SpellId } from './spells.js';
import type { BotSkill, MatchMode, MoveInput } from './types.js';

export interface JoinOptions {
  name?: string;
  mode?: MatchMode;
  partyCode?: string;
  custom?: boolean;
  arenaPresetId?: string;
  botSkill?: BotSkill;
  minHumanPlayers?: number;
  botCount?: number;
}

export interface GlobalChatJoinOptions {
  name?: string;
}

export interface GlobalChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
}

export type ClientMessage =
  | { type: 'move'; input: MoveInput }
  | { type: 'cast'; spellId: SpellId }
  | { type: 'rematch_ready' };

export type GlobalChatClientMessage =
  | { type: 'chat_send'; text: string };

export type ServerEvent =
  | { type: 'spell_confirmed'; playerId: string; spellId: SpellId; x: number; y: number; z: number }
  | { type: 'cast_denied'; spellId: string; reason: string }
  | { type: 'damage'; targetId: string; amount: number; hp: number }
  | { type: 'projectile_impact'; ownerId: string; spellId: SpellId; targetId?: string; x: number; y: number; z: number }
  | { type: 'trap_placed'; trapOwnerId: string; spellId: SpellId; x: number; z: number; radius: number }
  | { type: 'trap_triggered'; trapOwnerId: string; targetId: string; x: number; z: number }
  | { type: 'mark_applied'; targetId: string; spellId: SpellId; x: number; z: number }
  | { type: 'mark_consumed'; targetId: string; spellId: SpellId; x: number; z: number }
  | { type: 'ground_line_hit'; casterId: string; targetIds: string[]; x: number; z: number; dirX: number; dirZ: number }
  | {
      type: 'glacial_spike_telegraph';
      casterId: string;
      spellId: 'glacial_spikes';
      hazards: Array<{ id: string; x: number; z: number; radius: number; delayMs: number }>;
    }
  | {
      type: 'glacial_spike_erupted';
      casterId: string;
      hazards: Array<{ id: string; x: number; z: number; radius: number; hitTargetIds: string[] }>;
    }
  | { type: 'shield_exploded'; casterId: string; x: number; z: number }
  | { type: 'bot_added'; count: number; skill: BotSkill }
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
      winnerTeamId?: string;
      rematchAvailable?: boolean;
      rematchVotes?: number;
      rematchRequired?: number;
    };

export type GlobalChatServerEvent =
  | { type: 'chat_history'; messages: GlobalChatMessage[]; onlineCount: number }
  | { type: 'chat_message'; message: GlobalChatMessage; onlineCount: number }
  | { type: 'chat_presence'; onlineCount: number };
