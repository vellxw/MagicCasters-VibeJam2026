import { saveGraphicsTier, type GraphicsTier } from '../utils/GraphicsSettings';
import { AUDIO_CHANNELS, type AudioChannel } from '../audio/AudioCatalog';
import { DEFAULT_AUDIO_SETTINGS, type AudioSettings } from '../audio/AudioSettings';

const LABELS: Record<GraphicsTier, { title: string; desc: string }> = {
  auto: { title: 'Auto', desc: 'Detect automatically' },
  low: { title: 'Low', desc: 'Maximum performance' },
  medium: { title: 'Medium', desc: 'Balanced' },
  high: { title: 'High', desc: 'Maximum quality' }
};

const ORDER: GraphicsTier[] = ['auto', 'low', 'medium', 'high'];

export class QualitySettingsModal {
  readonly element: HTMLDivElement;

  constructor(
    root: HTMLElement,
    currentTier: GraphicsTier,
    audioSettings: AudioSettings = DEFAULT_AUDIO_SETTINGS,
    onAudioSettingsChange?: (settings: AudioSettings) => void
  ) {
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
      </div>
    `;

    root.appendChild(this.element);

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
  }

  dispose(): void {
    this.element.remove();
  }
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
