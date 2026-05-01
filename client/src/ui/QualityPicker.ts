import type { GraphicsTier } from '../utils/GraphicsSettings';

const LABELS: Record<GraphicsTier, { title: string; desc: string }> = {
  auto: { title: 'Auto', desc: 'Detect automatically' },
  low: { title: 'Low', desc: 'Maximum performance' },
  medium: { title: 'Medium', desc: 'Balanced' },
  high: { title: 'High', desc: 'Maximum quality' }
};

const ORDER: GraphicsTier[] = ['auto', 'low', 'medium', 'high'];

export class QualityPicker {
  readonly element: HTMLDivElement;
  onSelect?: (tier: GraphicsTier, remember: boolean) => void;

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'quality-picker';
    this.element.innerHTML = `
      <div class="quality-picker__inner">
        <h1 class="quality-picker__title">Graphics Quality</h1>
        <div class="quality-picker__options">
          ${ORDER.map((tier) => `
            <button type="button" class="quality-picker__option" data-tier="${tier}" ${tier === 'auto' ? 'data-recommended="true"' : ''}>
              <span class="quality-picker__option-title">${LABELS[tier].title}</span>
              <span class="quality-picker__option-desc">${LABELS[tier].desc}${tier === 'auto' ? ' (Recommended)' : ''}</span>
            </button>
          `).join('')}
        </div>
        <label class="quality-picker__remember">
          <input type="checkbox" data-remember />
          <span>Remember my choice</span>
        </label>
      </div>
    `;

    root.appendChild(this.element);

    const rememberInput = this.element.querySelector<HTMLInputElement>('[data-remember]')!;

    for (const btn of this.element.querySelectorAll<HTMLButtonElement>('[data-tier]')) {
      btn.addEventListener('click', () => {
        const tier = btn.dataset.tier as GraphicsTier;
        const remember = rememberInput.checked;
        this.onSelect?.(tier, remember);
      });
    }
  }

  show(): void {
    this.element.dataset.visible = 'true';
  }

  hide(): void {
    this.element.dataset.visible = 'false';
  }

  dispose(): void {
    this.element.remove();
  }
}
