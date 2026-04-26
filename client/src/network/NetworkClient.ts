import { Client, type Room } from 'colyseus.js';
import { ROOM_NAME, type MoveInput } from '../../../shared/types';
import type { SpellId } from '../../../shared/spells';

export type NetRoom = Room;

export class NetworkClient {
  room: NetRoom | null = null;
  status = 'offline';
  onState?: (state: any) => void;
  onEvent?: (type: string, payload: any) => void;

  private client: Client;

  constructor(endpoint: string) {
    this.client = new Client(endpoint);
  }

  async connect(name: string): Promise<void> {
    this.status = 'connecting';
    this.room = await this.client.joinOrCreate(ROOM_NAME, { name });
    this.status = 'connected';

    this.room.onStateChange((state: any) => {
      this.onState?.(state);
    });

    for (const type of ['phase', 'spell_confirmed', 'cast_denied', 'damage']) {
      this.room.onMessage(type, (payload: any) => this.onEvent?.(type, payload));
    }
  }

  sendMove(input: MoveInput): void {
    this.room?.send('move', input);
  }

  cast(spellId: SpellId): void {
    this.room?.send('cast', { spellId });
  }
}
