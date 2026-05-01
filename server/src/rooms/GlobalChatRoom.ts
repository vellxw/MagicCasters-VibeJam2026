import type { Client } from '@colyseus/core';
import { Room } from '@colyseus/core';
import type { GlobalChatJoinOptions, GlobalChatMessage } from '../../../shared/net.js';

export const CHAT_HISTORY_LIMIT = 50;
const CHAT_TEXT_LIMIT = 180;
const CHAT_SEND_COOLDOWN_MS = 800;

interface CreateChatMessageArgs {
  senderId: string;
  senderName: string;
  text: string;
  now?: number;
}

export class ChatHistory {
  readonly messages: GlobalChatMessage[] = [];

  push(message: GlobalChatMessage): void {
    this.messages.push(message);
    if (this.messages.length > CHAT_HISTORY_LIMIT) {
      this.messages.splice(0, this.messages.length - CHAT_HISTORY_LIMIT);
    }
  }
}

export class GlobalChatRoom extends Room {
  maxClients = 1000;

  private readonly history = createChatHistory();
  private readonly names = new Map<string, string>();
  private readonly lastSendAt = new Map<string, number>();

  onCreate(): void {
    this.onMessage('chat_send', (client, payload: { text?: string }) => {
      this.handleChatSend(client, payload);
    });
  }

  onJoin(client: Client, options?: GlobalChatJoinOptions): void {
    const name = sanitizeChatName(options?.name);
    this.names.set(client.sessionId, name);
    client.send('chat_history', {
      messages: this.history.messages,
      onlineCount: this.clients.length
    });
    this.broadcastPresence();
  }

  onLeave(client: Client): void {
    this.names.delete(client.sessionId);
    this.lastSendAt.delete(client.sessionId);
    this.broadcastPresence();
  }

  private handleChatSend(client: Client, payload: { text?: string }): void {
    const now = Date.now();
    const lastSendAt = this.lastSendAt.get(client.sessionId) ?? 0;
    if (now - lastSendAt < CHAT_SEND_COOLDOWN_MS) return;

    const text = sanitizeChatText(payload?.text);
    if (!text) return;

    this.lastSendAt.set(client.sessionId, now);
    const message = createChatMessage({
      senderId: client.sessionId,
      senderName: this.names.get(client.sessionId) ?? sanitizeChatName(''),
      text,
      now
    });
    this.history.push(message);
    this.broadcast('chat_message', {
      message,
      onlineCount: this.clients.length
    });
  }

  private broadcastPresence(): void {
    this.broadcast('chat_presence', {
      onlineCount: this.clients.length
    });
  }
}

export function createChatHistory(): ChatHistory {
  return new ChatHistory();
}

export function createChatMessage(args: CreateChatMessageArgs): GlobalChatMessage {
  const sentAt = args.now ?? Date.now();
  return {
    id: `chat-${sentAt}-${hashString(`${args.senderId}:${args.text}`)}`,
    senderId: args.senderId,
    senderName: sanitizeChatName(args.senderName),
    text: sanitizeChatText(args.text),
    sentAt
  };
}

export function sanitizeChatName(value: unknown): string {
  const clean = typeof value === 'string'
    ? value.replace(/[^\w \-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18)
    : '';
  return clean || `Mage ${Math.floor(Math.random() * 900 + 100)}`;
}

export function sanitizeChatText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, CHAT_TEXT_LIMIT);
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}
