import { Client, type Room } from 'colyseus.js';
import {
  ROOM_NAME,
  type MatchMode,
  type MoveInput
} from '../../../shared/types';
import type { SpellId } from '../../../shared/spells';
import type { CharacterClass } from '../../../shared/classes';

export type NetRoom = Room;

export interface JoinRequest {
  roomName: typeof ROOM_NAME;
  options: {
    name: string;
    mode: MatchMode;
    characterClass: CharacterClass;
  };
}

export function createJoinOptions(name: string, mode: MatchMode, characterClass: CharacterClass): JoinRequest {
  return {
    roomName: ROOM_NAME,
    options: {
      name,
      mode,
      characterClass
    }
  };
}

export class NetworkClient {
  room: NetRoom | null = null;
  status = 'offline';
  onState?: (state: any) => void;
  onEvent?: (type: string, payload: any) => void;

  private client: Client;

  constructor(endpoint: string) {
    this.client = new Client(endpoint);
  }

  async connect(name: string, mode: MatchMode, characterClass: CharacterClass = 'arcanist'): Promise<void> {
    this.status = 'connecting';
    const request = createJoinOptions(name, mode, characterClass);
    this.room = await this.client.joinOrCreate(request.roomName, request.options);
    this.status = 'connected';

    this.room.onStateChange((state: any) => {
      this.onState?.(state);
    });

    for (const type of ['phase', 'spell_confirmed', 'cast_denied', 'damage']) {
      this.room.onMessage(type, (payload: any) => this.onEvent?.(type, payload));
    }

    this.onState?.(this.room.state);
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

  leave(): void {
    this.room?.leave();
    this.room = null;
    this.status = 'offline';
  }
}
