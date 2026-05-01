import { SPELLS, getClassSpellVariant, getSpellIdsForClass } from '../../../shared/spells';
import { CLASSES, type CharacterClass } from '../../../shared/classes';
import type { SpellId } from '../../../shared/spells';

export class CharacterSelectOverlay {
  readonly element: HTMLDivElement;
  readonly previewArea: HTMLDivElement;

  private backButton: HTMLButtonElement;
  private tabArcanist: HTMLButtonElement;
  private tabDivine: HTMLButtonElement;
  private spellList: HTMLDivElement;
  private confirmButton: HTMLButtonElement;
  private classDescription: HTMLParagraphElement;
  private classTitle: HTMLHeadingElement;

  private selectedClass: CharacterClass = 'arcanist';
  private selectedSpell: SpellId | null = null;

  onBack?: () => void;
  onClassSelect?: (characterClass: CharacterClass) => void;
  onConfirm?: (characterClass: CharacterClass) => void;
  onSpellHover?: (spellId: SpellId | null) => void;

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'character-select';
    this.element.innerHTML = `
      <div class="character-select__header">
        <button type="button" class="character-select__back">&larr; Volver</button>
        <h2 class="character-select__title">SELECT YOUR MAGE</h2>
      </div>
      <div class="character-select__body">
        <div class="character-select__preview-area">
          <div class="character-select__hint">Arrastra para rotar</div>
        </div>
        <div class="character-select__panel">
          <div class="character-select__tabs">
            <button type="button" data-class="arcanist" class="character-select__tab character-select__tab--arcanist">
              <span class="character-select__tab-name">Arcanist</span>
              <span class="character-select__tab-sub">Hechicero Oscuro</span>
            </button>
            <button type="button" data-class="divine" class="character-select__tab character-select__tab--divine">
              <span class="character-select__tab-name">Divine</span>
              <span class="character-select__tab-sub">Hechicero Divino</span>
            </button>
          </div>
          <div class="character-select__class-info">
            <h3 class="character-select__class-title"></h3>
            <p class="character-select__class-desc"></p>
          </div>
          <div class="character-select__spells">
            <div class="character-select__spells-label">HABILIDADES</div>
            <div class="character-select__spell-list"></div>
          </div>
          <button type="button" class="character-select__confirm">CONFIRMAR</button>
        </div>
      </div>
    `;

    root.appendChild(this.element);

    this.backButton = this.element.querySelector('.character-select__back')!;
    this.previewArea = this.element.querySelector('.character-select__preview-area')!;
    this.tabArcanist = this.element.querySelector('[data-class="arcanist"]')!;
    this.tabDivine = this.element.querySelector('[data-class="divine"]')!;
    this.spellList = this.element.querySelector('.character-select__spell-list')!;
    this.confirmButton = this.element.querySelector('.character-select__confirm')!;
    this.classDescription = this.element.querySelector('.character-select__class-desc')!;
    this.classTitle = this.element.querySelector('.character-select__class-title')!;

    this.backButton.addEventListener('click', () => this.onBack?.());
    this.tabArcanist.addEventListener('click', () => this.selectClass('arcanist'));
    this.tabDivine.addEventListener('click', () => this.selectClass('divine'));
    this.confirmButton.addEventListener('click', () => this.onConfirm?.(this.selectedClass));

    this.selectClass('arcanist');
  }

  show(): void {
    this.element.dataset.visible = 'true';
  }

  hide(): void {
    this.element.dataset.visible = 'false';
    this.selectedSpell = null;
    this.onSpellHover?.(null);
  }

  private selectClass(characterClass: CharacterClass): void {
    this.selectedClass = characterClass;
    this.onClassSelect?.(characterClass);

    const cls = CLASSES[characterClass];

    this.tabArcanist.dataset.active = String(characterClass === 'arcanist');
    this.tabDivine.dataset.active = String(characterClass === 'divine');

    this.classTitle.textContent = cls.title;
    this.classDescription.textContent = cls.description;

    this.renderSpells(characterClass);
  }

  private renderSpells(characterClass: CharacterClass): void {
    this.spellList.innerHTML = '';

    for (const spellId of getSpellIdsForClass(characterClass)) {
      const base = SPELLS[spellId];
      const variant = getClassSpellVariant(spellId, characterClass);

      const card = document.createElement('div');
      card.className = 'character-select__spell-card';
      card.dataset.spellId = spellId;
      card.innerHTML = `
        <div class="character-select__spell-key">${base.key}</div>
        <div class="character-select__spell-info">
          <div class="character-select__spell-name" style="color: #${variant.color.toString(16).padStart(6, '0')}">${variant.label}</div>
          <div class="character-select__spell-meta">
            <span>${base.damage} dmg</span>
            <span>${base.manaCost} mana</span>
          </div>
          <div class="character-select__spell-desc">${variant.description}</div>
        </div>
      `;

      card.addEventListener('mouseenter', () => {
        this.selectedSpell = spellId;
        this.onSpellHover?.(spellId);
        card.dataset.hovered = 'true';
      });
      card.addEventListener('mouseleave', () => {
        this.selectedSpell = null;
        this.onSpellHover?.(null);
        card.dataset.hovered = 'false';
      });

      this.spellList.appendChild(card);
    }
  }
}
