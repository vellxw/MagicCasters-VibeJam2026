import { Client, type Room } from 'colyseus.js';
import {
  ROOM_NAME,
  type BotSkill,
  type MatchMode,
  type MoveInput
} from '../../../shared/types';
import type { SpellId } from '../../../shared/spells';
import type { CharacterClass } from '../../../shared/classes';

export interface CustomRoomOptions {
  partyCode?: string;
  arenaPresetId?: string;
  botSkill?: BotSkill;
  minHumanPlayers?: number;
  botCount?: number;
}

export type NetRoom = Room;

export interface JoinRequest {
  roomName: typeof ROOM_NAME;
  options: {
    name: string;
    mode: MatchMode;
    characterClass: CharacterClass;
    partyCode: string;
    custom?: boolean;
    arenaPresetId?: string;
    botSkill?: BotSkill;
    minHumanPlayers?: number;
    botCount?: number;
  };
}

export function createJoinOptions(
  name: string,
  mode: MatchMode,
  characterClass: CharacterClass,
  customOptions: CustomRoomOptions = {}
): JoinRequest {
  const partyCode = normalizePartyCode(customOptions.partyCode);
  return {
    roomName: ROOM_NAME,
    options: {
      name,
      mode,
      characterClass,
      partyCode,
      ...(partyCode ? { custom: true } : {}),
      ...(customOptions.arenaPresetId ? { arenaPresetId: customOptions.arenaPresetId } : {}),
      ...(partyCode && customOptions.botSkill ? { botSkill: customOptions.botSkill } : {}),
      ...(partyCode && isPositiveInteger(customOptions.minHumanPlayers) ? { minHumanPlayers: customOptions.minHumanPlayers } : {}),
      ...(partyCode && isPositiveInteger(customOptions.botCount) ? { botCount: customOptions.botCount } : {})
    }
  };
}

export const SERVER_MESSAGE_TYPES = [
  'phase',
  'spell_confirmed',
  'cast_denied',
  'damage',
  'projectile_impact',
  'trap_placed',
  'trap_triggered',
  'mark_applied',
  'mark_consumed',
  'ground_line_hit',
  'glacial_spike_telegraph',
  'glacial_spike_erupted',
  'shield_exploded',
  'bot_added'
] as const;

export class NetworkClient {
  room: NetRoom | null = null;
  status = 'offline';
  onState?: (state: any) => void;
  onEvent?: (type: string, payload: any) => void;

  private client: Client;

  constructor(endpoint: string) {
    this.client = new Client(endpoint);
  }

  async connect(
    name: string,
    mode: MatchMode,
    characterClass: CharacterClass = 'arcanist',
    customOptions: CustomRoomOptions = {}
  ): Promise<void> {
    this.status = 'connecting';
    const request = createJoinOptions(name, mode, characterClass, customOptions);
    this.room = await this.client.joinOrCreate(request.roomName, request.options);
    this.bindRoom();
  }

  async connectByPartyCode(name: string, partyCode: string, characterClass: CharacterClass = 'arcanist'): Promise<void> {
    this.status = 'connecting';
    const normalizedCode = normalizePartyCode(partyCode);
    let lastError: unknown = null;
    for (const mode of ['1v1', '2v2'] as const) {
      try {
        this.room = await this.client.join(ROOM_NAME, {
          name,
          mode,
          characterClass,
          partyCode: normalizedCode,
          custom: true
        });
        this.bindRoom();
        return;
      } catch (error) {
        lastError = error;
      }
    }
    this.status = 'offline';
    throw lastError ?? new Error('custom_room_not_found');
  }

  private bindRoom(): void {
    this.status = 'connected';

    this.room?.onStateChange((state: any) => {
      this.onState?.(state);
    });

    for (const type of SERVER_MESSAGE_TYPES) {
      this.room?.onMessage(type, (payload: any) => this.onEvent?.(type, payload));
    }

    if (this.room) {
      this.onState?.(this.room.state);
    }
  }

  get localSessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  get connected(): boolean {
    return this.status === 'connected' && this.room !== null;
  }

  sendMove(input: MoveInput): void {
    this.room?.send('move', input);
  }

  cast(spellId: SpellId): void {
    this.room?.send('cast', { spellId });
  }

  sendRematchReady(): void {
    this.room?.send('rematch_ready');
  }

  leave(): void {
    this.room?.leave();
    this.room = null;
    this.status = 'offline';
  }
}

function normalizePartyCode(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
    : '';
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
