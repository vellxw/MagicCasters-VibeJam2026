import type { GlobalChatMessage } from '../../../shared/net';

type SceneMode = 'LOBBY' | 'CUSTOM' | 'CHARACTER_SELECT' | 'QUEUE' | 'MATCH' | 'RESULTS' | 'CALIBRATION' | 'VFX_EDITOR';

export class GlobalChatOverlay {
  readonly element: HTMLDivElement;

  private readonly logEl: HTMLElement;
  private readonly peekEl: HTMLElement;
  private readonly peekMessagesEl: HTMLElement;
  private readonly formEl: HTMLFormElement;
  private readonly inputEl: HTMLInputElement;
  private readonly presenceEl: HTMLElement;
  private readonly collapseButtonEl: HTMLButtonElement;
  private messages: GlobalChatMessage[] = [];

  onSend?: (text: string) => void;

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'global-chat';
    this.element.dataset.visible = 'false';
    this.element.dataset.expanded = 'false';
    this.element.innerHTML = `
      <button class="global-chat__peek" type="button" data-chat-peek aria-label="Open global chat">
        <span class="global-chat__peek-title">Global chat</span>
        <span class="global-chat__peek-messages" data-chat-peek-messages></span>
        <span class="global-chat__peek-arrow" aria-hidden="true">^</span>
      </button>
      <div class="global-chat__frame" aria-label="Global chat">
        <button class="global-chat__collapse" type="button" data-chat-collapse aria-label="Collapse global chat">x</button>
        <div class="global-chat__presence" data-chat-presence>offline</div>
        <div class="global-chat__log" data-chat-log></div>
        <form class="global-chat__form" data-chat-form>
          <input data-chat-input maxlength="180" autocomplete="off" placeholder="Say something..." />
          <button type="submit">Send</button>
        </form>
      </div>
    `;
    root.appendChild(this.element);

    this.logEl = this.element.querySelector('[data-chat-log]')!;
    this.peekEl = this.element.querySelector('[data-chat-peek]')!;
    this.peekMessagesEl = this.element.querySelector('[data-chat-peek-messages]')!;
    this.formEl = this.element.querySelector('[data-chat-form]')!;
    this.inputEl = this.element.querySelector('[data-chat-input]')!;
    this.presenceEl = this.element.querySelector('[data-chat-presence]')!;
    this.collapseButtonEl = this.element.querySelector('[data-chat-collapse]')!;
    this.peekEl.addEventListener('click', () => this.setExpanded(true));
    this.collapseButtonEl.addEventListener('click', () => this.setExpanded(false));
    this.formEl.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = this.inputEl.value.trim();
      if (!text) return;
      this.onSend?.(text);
      this.inputEl.value = '';
    });
  }

  setScene(scene: SceneMode): void {
    const visible = scene === 'LOBBY';
    this.element.dataset.visible = String(visible);
    if (!visible) this.setExpanded(false);
  }

  setStatus(status: string): void {
    if (status !== 'connected') {
      this.presenceEl.textContent = status;
    }
  }

  setPresence(onlineCount: number): void {
    this.presenceEl.textContent = `${onlineCount} online`;
  }

  setHistory(messages: GlobalChatMessage[], onlineCount: number): void {
    this.messages = messages.slice(-50);
    this.setPresence(onlineCount);
    this.renderMessages();
  }

  addMessage(message: GlobalChatMessage, onlineCount: number): void {
    this.messages = [...this.messages, message].slice(-50);
    this.setPresence(onlineCount);
    this.renderMessages();
  }

  private renderMessages(): void {
    this.logEl.innerHTML = '';
    this.peekMessagesEl.innerHTML = '';

    const previewMessages = this.messages.slice(-3);
    if (previewMessages.length === 0) {
      const preview = document.createElement('span');
      preview.className = 'global-chat__peek-empty';
      preview.textContent = 'No messages yet';
      this.peekMessagesEl.appendChild(preview);
    } else {
      for (const message of previewMessages) {
        const preview = document.createElement('span');
        preview.className = 'global-chat__peek-message';
        preview.textContent = `${message.senderName}: ${message.text}`;
        this.peekMessagesEl.appendChild(preview);
      }
    }

    if (this.messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'global-chat__empty';
      empty.textContent = 'No messages yet.';
      this.logEl.appendChild(empty);
      return;
    }

    for (const message of this.messages) {
      const row = document.createElement('div');
      row.className = 'global-chat__message';
      const name = document.createElement('strong');
      name.textContent = message.senderName;
      const text = document.createElement('span');
      text.textContent = message.text;
      row.append(name, text);
      this.logEl.appendChild(row);
    }
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private setExpanded(expanded: boolean): void {
    this.element.dataset.expanded = String(expanded);
    if (expanded) {
      requestAnimationFrame(() => this.inputEl.focus());
      this.logEl.scrollTop = this.logEl.scrollHeight;
    } else {
      this.inputEl.blur();
    }
  }
}
