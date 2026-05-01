import { Client, type Room } from 'colyseus.js';
import { GLOBAL_CHAT_ROOM_NAME } from '../../../shared/types';
import type { GlobalChatMessage } from '../../../shared/net';

export class GlobalChatClient {
  status = 'offline';
  onHistory?: (messages: GlobalChatMessage[], onlineCount: number) => void;
  onMessage?: (message: GlobalChatMessage, onlineCount: number) => void;
  onPresence?: (onlineCount: number) => void;
  onStatus?: (status: string) => void;

  private readonly client: Client;
  private room: Room | null = null;

  constructor(endpoint: string) {
    this.client = new Client(endpoint);
  }

  async connect(name: string): Promise<void> {
    if (this.room) return;
    this.setStatus('connecting');
    try {
      this.room = await this.client.joinOrCreate(GLOBAL_CHAT_ROOM_NAME, { name });
      this.bindRoom();
      this.setStatus('connected');
    } catch (error) {
      this.room = null;
      this.setStatus('offline');
      throw error;
    }
  }

  send(text: string): void {
    this.room?.send('chat_send', { text });
  }

  leave(): void {
    this.room?.leave();
    this.room = null;
    this.setStatus('offline');
  }

  private bindRoom(): void {
    this.room?.onMessage('chat_history', (payload: { messages?: GlobalChatMessage[]; onlineCount?: number }) => {
      this.onHistory?.(Array.isArray(payload.messages) ? payload.messages : [], payload.onlineCount ?? 0);
    });
    this.room?.onMessage('chat_message', (payload: { message?: GlobalChatMessage; onlineCount?: number }) => {
      if (payload.message) this.onMessage?.(payload.message, payload.onlineCount ?? 0);
    });
    this.room?.onMessage('chat_presence', (payload: { onlineCount?: number }) => {
      this.onPresence?.(payload.onlineCount ?? 0);
    });
    this.room?.onLeave(() => {
      this.room = null;
      this.setStatus('offline');
    });
  }

  private setStatus(status: string): void {
    this.status = status;
    this.onStatus?.(status);
  }
}
