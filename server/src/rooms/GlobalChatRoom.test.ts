import { describe, expect, it } from 'vitest';
import {
  CHAT_HISTORY_LIMIT,
  createChatHistory,
  createChatMessage,
  sanitizeChatName,
  sanitizeChatText
} from './GlobalChatRoom';

describe('GlobalChatRoom helpers', () => {
  it('sanitizes chat names and message text before broadcasting', () => {
    expect(sanitizeChatName('@@ Dark Mage !! With A Very Long Name')).toBe('Dark Mage With A V');
    expect(sanitizeChatName('')).toMatch(/^Mage \d{3}$/);
    expect(sanitizeChatText('  hello\n<script>boom</script>  ')).toBe('hello <script>boom</script>');
  });

  it('creates bounded chat history with stable public messages', () => {
    const history = createChatHistory();
    for (let index = 0; index < CHAT_HISTORY_LIMIT + 3; index++) {
      history.push(createChatMessage({
        senderId: `session-${index}`,
        senderName: `Mage ${index}`,
        text: `message ${index}`,
        now: index
      }));
    }

    expect(history.messages).toHaveLength(CHAT_HISTORY_LIMIT);
    expect(history.messages[0].text).toBe('message 3');
    expect(history.messages.at(-1)).toMatchObject({
      senderId: `session-${CHAT_HISTORY_LIMIT + 2}`,
      senderName: `Mage ${CHAT_HISTORY_LIMIT + 2}`,
      text: `message ${CHAT_HISTORY_LIMIT + 2}`,
      sentAt: CHAT_HISTORY_LIMIT + 2
    });
  });
});
