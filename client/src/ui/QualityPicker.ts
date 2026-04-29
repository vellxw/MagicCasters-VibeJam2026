import type { GraphicsTier } from '../utils/GraphicsSettings';

const LABELS: Record<GraphicsTier, { title: string; desc: string }> = {
  auto: { title: 'Auto', desc: 'Detectar automáticamente' },
  low: { title: 'Bajo', desc: 'Máximo rendimiento' },
  medium: { title: 'Medio', desc: 'Balanceado' },
  high: { title: 'Alto', desc: 'Máxima calidad' }
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
        <h1 class="quality-picker__title">Calidad Gráfica</h1>
        <div class="quality-picker__options">
          ${ORDER.map((tier) => `
            <button type="button" class="quality-picker__option" data-tier="${tier}" ${tier === 'auto' ? 'data-recommended="true"' : ''}>
              <span class="quality-picker__option-title">${LABELS[tier].title}</span>
              <span class="quality-picker__option-desc">${LABELS[tier].desc}${tier === 'auto' ? ' (Recomendado)' : ''}</span>
            </button>
          `).join('')}
        </div>
        <label class="quality-picker__remember">
          <input type="checkbox" data-remember />
          <span>Recordar mi elección</span>
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
