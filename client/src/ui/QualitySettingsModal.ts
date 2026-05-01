import { saveGraphicsTier, type GraphicsTier } from '../utils/GraphicsSettings';

const LABELS: Record<GraphicsTier, { title: string; desc: string }> = {
  auto: { title: 'Auto', desc: 'Detect automatically' },
  low: { title: 'Low', desc: 'Maximum performance' },
  medium: { title: 'Medium', desc: 'Balanced' },
  high: { title: 'High', desc: 'Maximum quality' }
};

const ORDER: GraphicsTier[] = ['auto', 'low', 'medium', 'high'];

export class QualitySettingsModal {
  readonly element: HTMLDivElement;

  constructor(root: HTMLElement, currentTier: GraphicsTier) {
    this.element = document.createElement('div');
    this.element.className = 'quality-modal';
    this.element.innerHTML = `
      <div class="quality-modal__backdrop"></div>
      <div class="quality-modal__panel">
        <div class="quality-modal__header">
          <strong>Graphics Quality</strong>
          <button type="button" class="quality-modal__close" aria-label="Close">×</button>
        </div>
        <div class="quality-modal__options">
          ${ORDER.map((tier) => `
            <button type="button" class="quality-modal__option${tier === currentTier ? ' quality-modal__option--active' : ''}" data-tier="${tier}">
              <span class="quality-modal__option-title">${LABELS[tier].title}</span>
              <span class="quality-modal__option-desc">${LABELS[tier].desc}${tier === 'auto' ? ' (Recommended)' : ''}</span>
            </button>
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
  }

  dispose(): void {
    this.element.remove();
  }
}
