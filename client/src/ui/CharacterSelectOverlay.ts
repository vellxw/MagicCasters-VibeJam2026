import { SPELLS, getClassSpellVariant, getSpellIdsForClass } from '../../../shared/spells';
import { CLASSES, type CharacterClass } from '../../../shared/classes';
import type { SpellId } from '../../../shared/spells';

interface CharacterSelectContext {
  modeLabel: string;
  arenaLabel: string;
}

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
  private modeLabel: HTMLSpanElement;
  private arenaLabel: HTMLElement;
  private confirmClass: HTMLElement;

  private selectedClass: CharacterClass = 'arcanist';
  private selectedSpell: SpellId | null = null;

  onBack?: () => void;
  onClassSelect?: (characterClass: CharacterClass) => void;
  onConfirm?: (characterClass: CharacterClass) => void;
  onSpellHover?: (spellId: SpellId | null) => void;

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'character-select';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML = `
      <div class="character-select__header">
        <button type="button" class="character-select__back">Back</button>
        <div class="character-select__heading">
          <span class="character-select__eyebrow">Character Select</span>
          <h2 class="character-select__title">Choose Your Mage</h2>
        </div>
        <div class="character-select__context">
          <span class="character-select__mode"></span>
          <strong class="character-select__arena"></strong>
        </div>
      </div>
      <div class="character-select__body">
        <aside class="character-select__side character-select__side--classes">
          <div class="character-select__section-label">Classes</div>
          <div class="character-select__tabs">
            <button type="button" data-class="arcanist" class="character-select__tab character-select__tab--arcanist">
              <span class="character-select__tab-kicker">Shadow</span>
              <span class="character-select__tab-name">Arcanist</span>
              <span class="character-select__tab-sub">Marks and combos</span>
            </button>
            <button type="button" data-class="divine" class="character-select__tab character-select__tab--divine">
              <span class="character-select__tab-kicker">Light</span>
              <span class="character-select__tab-name">Divine</span>
              <span class="character-select__tab-sub">Control and punishment</span>
            </button>
          </div>
          <div class="character-select__class-info">
            <span class="character-select__section-label">Archetype</span>
            <h3 class="character-select__class-title"></h3>
            <p class="character-select__class-desc"></p>
          </div>
        </aside>
        <div class="character-select__preview-area">
          <div class="character-select__hint">Drag to rotate</div>
        </div>
        <aside class="character-select__side character-select__side--loadout">
          <div class="character-select__spells">
            <div class="character-select__loadout-head">
              <span class="character-select__section-label">Combat Kit</span>
              <strong>4 abilities</strong>
            </div>
            <div class="character-select__spell-list"></div>
          </div>
          <button type="button" class="character-select__confirm">
            <span>Confirm</span>
            <small></small>
          </button>
        </aside>
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
    this.modeLabel = this.element.querySelector('.character-select__mode')!;
    this.arenaLabel = this.element.querySelector('.character-select__arena')!;
    this.confirmClass = this.element.querySelector('.character-select__confirm small')!;

    this.backButton.addEventListener('click', () => this.onBack?.());
    this.tabArcanist.addEventListener('click', () => this.selectClass('arcanist'));
    this.tabDivine.addEventListener('click', () => this.selectClass('divine'));
    this.confirmButton.addEventListener('click', () => this.onConfirm?.(this.selectedClass));

    this.selectClass('arcanist');
  }

  show(context?: CharacterSelectContext): void {
    if (context) {
      this.modeLabel.textContent = context.modeLabel;
      this.arenaLabel.textContent = context.arenaLabel;
    }
    this.element.dataset.visible = 'true';
    this.element.setAttribute('aria-hidden', 'false');
  }

  hide(): void {
    this.element.dataset.visible = 'false';
    this.element.setAttribute('aria-hidden', 'true');
    this.selectedSpell = null;
    for (const entry of Array.from(this.spellList.children)) {
      (entry as HTMLElement).dataset.hovered = 'false';
    }
    this.onSpellHover?.(null);
  }

  private selectClass(characterClass: CharacterClass): void {
    this.selectedSpell = null;
    this.onSpellHover?.(null);
    this.selectedClass = characterClass;
    this.onClassSelect?.(characterClass);

    const cls = CLASSES[characterClass];
    const color = `#${cls.themeColor.toString(16).padStart(6, '0')}`;

    this.element.dataset.class = characterClass;
    this.element.style.setProperty('--character-class-color', color);
    this.tabArcanist.dataset.active = String(characterClass === 'arcanist');
    this.tabDivine.dataset.active = String(characterClass === 'divine');
    this.tabArcanist.setAttribute('aria-selected', String(characterClass === 'arcanist'));
    this.tabDivine.setAttribute('aria-selected', String(characterClass === 'divine'));

    this.classTitle.textContent = cls.title;
    this.classDescription.textContent = cls.description;
    this.confirmClass.textContent = cls.name;

    this.renderSpells(characterClass);
  }

  private renderSpells(characterClass: CharacterClass): void {
    this.spellList.innerHTML = '';

    for (const spellId of getSpellIdsForClass(characterClass)) {
      const base = SPELLS[spellId];
      const variant = getClassSpellVariant(spellId, characterClass);
      const spellColor = `#${variant.color.toString(16).padStart(6, '0')}`;

      const card = document.createElement('div');
      card.className = 'character-select__spell-card';
      card.dataset.spellId = spellId;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.style.setProperty('--spell-color', spellColor);
      card.innerHTML = `
        <div class="character-select__spell-key">${base.key}</div>
        <div class="character-select__spell-info">
          <div class="character-select__spell-name">${variant.label}</div>
          <div class="character-select__spell-meta">
            <span>${base.damage} dmg</span>
            <span>${base.manaCost} mana</span>
          </div>
          <div class="character-select__spell-desc">${variant.description}</div>
        </div>
      `;

      const previewSpell = () => {
        this.selectedSpell = spellId;
        for (const entry of Array.from(this.spellList.children)) {
          (entry as HTMLElement).dataset.hovered = 'false';
        }
        this.onSpellHover?.(spellId);
        card.dataset.hovered = 'true';
      };
      const clearPreview = () => {
        if (this.selectedSpell === spellId) {
          this.selectedSpell = null;
          this.onSpellHover?.(null);
        }
        card.dataset.hovered = 'false';
      };

      card.addEventListener('mouseenter', previewSpell);
      card.addEventListener('mouseleave', clearPreview);
      card.addEventListener('focus', previewSpell);
      card.addEventListener('blur', clearPreview);
      card.addEventListener('click', previewSpell);

      this.spellList.appendChild(card);
    }
  }
}
