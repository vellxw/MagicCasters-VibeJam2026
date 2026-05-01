import { saveGraphicsTier, type GraphicsTier } from '../utils/GraphicsSettings';
import { AUDIO_CHANNELS, type AudioChannel } from '../audio/AudioCatalog';
import { DEFAULT_AUDIO_SETTINGS, type AudioSettings } from '../audio/AudioSettings';
import {
  COMBAT_ACTIONS,
  DEFAULT_COMBAT_KEY_BINDINGS,
  assignCombatKeyBinding,
  combatActionLabel,
  formatCombatKeyBinding,
  type CombatAction,
  type CombatKeyBindings
} from '../input/CombatKeyBindings';

const LABELS: Record<GraphicsTier, { title: string; desc: string }> = {
  auto: { title: 'Auto', desc: 'Detect automatically' },
  low: { title: 'Low', desc: 'Maximum performance' },
  medium: { title: 'Medium', desc: 'Balanced' },
  high: { title: 'High', desc: 'Maximum quality' }
};

const ORDER: GraphicsTier[] = ['auto', 'low', 'medium', 'high'];

export class QualitySettingsModal {
  readonly element: HTMLDivElement;
  private combatKeyBindings: CombatKeyBindings;
  private pendingKeyAction: CombatAction | null = null;
  private keyFeedback: HTMLElement | null = null;
  private keyCaptureHandler = (event: KeyboardEvent) => this.captureCombatKey(event);
  private mouseCaptureHandler = (event: MouseEvent) => this.captureCombatMouse(event);
  private contextMenuCaptureHandler = (event: MouseEvent) => {
    if (!this.pendingKeyAction) return;
    event.preventDefault();
    event.stopPropagation();
  };

  constructor(
    root: HTMLElement,
    currentTier: GraphicsTier,
    audioSettings: AudioSettings = DEFAULT_AUDIO_SETTINGS,
    onAudioSettingsChange?: (settings: AudioSettings) => void,
    combatKeyBindings: CombatKeyBindings = DEFAULT_COMBAT_KEY_BINDINGS,
    private onCombatKeyBindingsChange?: (settings: CombatKeyBindings) => void
  ) {
    this.combatKeyBindings = combatKeyBindings;
    this.element = document.createElement('div');
    this.element.className = 'quality-modal';
    this.element.innerHTML = `
      <div class="quality-modal__backdrop"></div>
      <div class="quality-modal__panel">
        <div class="quality-modal__header">
          <strong>Settings</strong>
          <button type="button" class="quality-modal__close" aria-label="Close">×</button>
        </div>
        <span class="quality-modal__section-title">Graphics Quality</span>
        <div class="quality-modal__options">
          ${ORDER.map((tier) => `
            <button type="button" class="quality-modal__option${tier === currentTier ? ' quality-modal__option--active' : ''}" data-tier="${tier}">
              <span class="quality-modal__option-title">${LABELS[tier].title}</span>
              <span class="quality-modal__option-desc">${LABELS[tier].desc}${tier === 'auto' ? ' (Recommended)' : ''}</span>
            </button>
          `).join('')}
        </div>
        <div class="quality-modal__audio">
          <span class="quality-modal__section-title">Audio</span>
          <label class="quality-modal__mute">
            <input type="checkbox" data-audio-muted ${audioSettings.muted ? 'checked' : ''} />
            <span>Mute all</span>
          </label>
          <label class="quality-modal__slider">
            <span>Master</span>
            <input type="range" min="0" max="1" step="0.01" value="${audioSettings.master}" data-audio-master />
          </label>
          ${AUDIO_CHANNELS.map((channel) => `
            <label class="quality-modal__slider">
              <span>${audioLabel(channel)}</span>
              <input type="range" min="0" max="1" step="0.01" value="${audioSettings.channels[channel]}" data-audio-channel="${channel}" />
            </label>
          `).join('')}
        </div>
        <div class="quality-modal__keybindings">
          <span class="quality-modal__section-title">Combat Keys</span>
          <div class="quality-modal__key-list">
            ${COMBAT_ACTIONS.map((action) => this.keyBindingButtonMarkup(action)).join('')}
          </div>
          <button type="button" class="quality-modal__reset-keys" data-reset-combat-keys>Reset combat keys</button>
          <span class="quality-modal__key-feedback" data-key-feedback></span>
        </div>
      </div>
    `;

    root.appendChild(this.element);
    this.keyFeedback = this.element.querySelector('[data-key-feedback]');

    const close = () => this.dispose();
    this.element.querySelector('.quality-modal__backdrop')?.addEventListener('click', close);
    this.element.querySelector('.quality-modal__close')?.addEventListener('click', close);

    for (const btn of this.element.querySelectorAll<HTMLButtonElement>('[data-tier]')) {
      btn.addEventListener('click', () => {
        const tier = btn.dataset.tier as GraphicsTier;
        saveGraphicsTier(tier);
        window.location.reload();
      });
    }

    const emitAudioSettings = () => {
      const muted = this.element.querySelector<HTMLInputElement>('[data-audio-muted]')?.checked ?? false;
      const master = Number(this.element.querySelector<HTMLInputElement>('[data-audio-master]')?.value ?? audioSettings.master);
      const channels = { ...audioSettings.channels };
      for (const input of this.element.querySelectorAll<HTMLInputElement>('[data-audio-channel]')) {
        const channel = input.dataset.audioChannel as AudioChannel;
        channels[channel] = Number(input.value);
      }
      onAudioSettingsChange?.({ muted, master, channels });
    };

    this.element.querySelector('[data-audio-muted]')?.addEventListener('change', emitAudioSettings);
    this.element.querySelector('[data-audio-master]')?.addEventListener('input', emitAudioSettings);
    for (const input of this.element.querySelectorAll('[data-audio-channel]')) {
      input.addEventListener('input', emitAudioSettings);
    }

    for (const btn of this.element.querySelectorAll<HTMLButtonElement>('[data-key-action]')) {
      btn.addEventListener('click', () => {
        const action = btn.dataset.keyAction as CombatAction;
        this.beginKeyCapture(action);
      });
    }
    this.element.querySelector('[data-reset-combat-keys]')?.addEventListener('click', () => {
      this.combatKeyBindings = DEFAULT_COMBAT_KEY_BINDINGS;
      this.onCombatKeyBindingsChange?.(this.combatKeyBindings);
      this.renderKeyBindingButtons();
      this.setKeyFeedback('');
    });
    window.addEventListener('keydown', this.keyCaptureHandler, true);
    window.addEventListener('mousedown', this.mouseCaptureHandler, true);
    window.addEventListener('contextmenu', this.contextMenuCaptureHandler, true);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyCaptureHandler, true);
    window.removeEventListener('mousedown', this.mouseCaptureHandler, true);
    window.removeEventListener('contextmenu', this.contextMenuCaptureHandler, true);
    this.element.remove();
  }

  private keyBindingButtonMarkup(action: CombatAction): string {
    return `
      <button type="button" class="quality-modal__key-option" data-key-action="${action}">
        <span>${combatActionLabel(action)}</span>
        <kbd>${formatCombatKeyBinding(this.combatKeyBindings[action])}</kbd>
      </button>
    `;
  }

  private beginKeyCapture(action: CombatAction): void {
    this.pendingKeyAction = action;
    this.setKeyFeedback('');
    this.renderKeyBindingButtons();
  }

  private captureCombatKey(event: KeyboardEvent): void {
    if (!this.pendingKeyAction) return;
    event.preventDefault();
    event.stopPropagation();

    const next = assignCombatKeyBinding(this.combatKeyBindings, this.pendingKeyAction, event);
    if (sameCombatKeyBindings(next, this.combatKeyBindings)) {
      this.setKeyFeedback('Reserved key');
      return;
    }

    this.combatKeyBindings = next;
    this.pendingKeyAction = null;
    this.onCombatKeyBindingsChange?.(next);
    this.renderKeyBindingButtons();
    this.setKeyFeedback('');
  }

  private renderKeyBindingButtons(): void {
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-key-action]')) {
      const action = button.dataset.keyAction as CombatAction;
      const capturing = this.pendingKeyAction === action;
      button.dataset.capturing = String(capturing);
      const keyEl = button.querySelector('kbd');
      if (keyEl) {
        keyEl.textContent = capturing ? 'Press key/click' : formatCombatKeyBinding(this.combatKeyBindings[action]);
      }
    }
  }

  private captureCombatMouse(event: MouseEvent): void {
    if (!this.pendingKeyAction) return;
    event.preventDefault();
    event.stopPropagation();

    const next = assignCombatKeyBinding(this.combatKeyBindings, this.pendingKeyAction, event);
    if (sameCombatKeyBindings(next, this.combatKeyBindings)) {
      this.setKeyFeedback('Reserved input');
      return;
    }

    this.combatKeyBindings = next;
    this.pendingKeyAction = null;
    this.onCombatKeyBindingsChange?.(next);
    this.renderKeyBindingButtons();
    this.setKeyFeedback('');
  }

  private setKeyFeedback(message: string): void {
    if (this.keyFeedback) {
      this.keyFeedback.textContent = message;
      this.keyFeedback.dataset.visible = String(Boolean(message));
    }
  }
}

function sameCombatKeyBindings(a: CombatKeyBindings, b: CombatKeyBindings): boolean {
  return COMBAT_ACTIONS.every((action) => a[action].code === b[action].code && a[action].key === b[action].key);
}

function audioLabel(channel: AudioChannel): string {
  switch (channel) {
    case 'music':
      return 'Music';
    case 'ambience':
      return 'Ambience';
    case 'sfx':
      return 'SFX';
    case 'ui':
      return 'UI';
    case 'voice':
      return 'Voice';
    default:
      return channel;
  }
}
