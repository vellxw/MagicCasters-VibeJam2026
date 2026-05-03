import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterSelectOverlay } from './CharacterSelectOverlay';

class FakeStyle {
  readonly values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  readonly style = new FakeStyle();
  readonly classNodes = new Map<string, FakeElement>();
  readonly listeners = new Map<string, Array<() => void>>();
  readonly classList = {
    add: vi.fn(),
    remove: vi.fn()
  };
  className = '';
  textContent = '';
  value = '';
  private html = '';

  set innerHTML(value: string) {
    this.html = value;
    this.classNodes.clear();
    for (const selector of [
      '.character-select__back',
      '[data-select-nav="previous"]',
      '[data-select-nav="next"]',
      '.character-select__preview-area',
      '[data-class="arcanist"]',
      '[data-class="divine"]',
      '.character-select__spell-list',
      '.character-select__stat-list',
      '.character-select__confirm',
      '.character-select__class-desc',
      '.character-select__class-title',
      '.character-select__quote',
      '.character-select__class-role',
      '.character-select__stage-title',
      '.character-select__mode',
      '.character-select__arena',
      '.character-select__profile-class',
      '.character-select__stat-value',
      '.character-select__confirm small',
      'button[aria-label="Profile"]',
      'button[aria-label="Lore"]',
      'button[aria-label="Messages"]',
      'button[aria-label="Customize"]',
      '#profile-modal',
      '#auth-guest-state',
      '#auth-logged-in-state',
      '#auth-username',
      '#auth-password',
      '#auth-error',
      '#btn-login',
      '#btn-register',
      '#btn-logout',
      '#logged-in-username',
      '#logged-in-mmr'
    ]) {
      this.classNodes.set(selector, new FakeElement());
    }
    this.classNodes.set('[data-close-modal]', new FakeElement());
  }

  get innerHTML(): string {
    return this.html;
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  querySelector(selector: string): FakeElement | null {
    return this.classNodes.get(selector) ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const node = this.classNodes.get(selector);
    return node ? [node] : [];
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }

  toggleAttribute(name: string, force?: boolean): void {
    if (force === false) {
      delete this.attributes[name];
      return;
    }
    this.attributes[name] = '';
  }

  remove(): void {
    this.children.length = 0;
  }
}

describe('CharacterSelectOverlay spell preview', () => {
  const originalDocument = globalThis.document;

  beforeEach(() => {
    globalThis.document = {
      createElement: vi.fn(() => new FakeElement())
    } as unknown as Document;
  });

  afterEach(() => {
    globalThis.document = originalDocument;
  });

  it('previews the exact spell when spell cards receive pointer, focus, or tap input', () => {
    const root = new FakeElement();
    const overlay = new CharacterSelectOverlay(root as unknown as HTMLElement);
    const previews: Array<string | null> = [];
    overlay.onSpellHover = (spellId) => previews.push(spellId);

    const spellList = (overlay as unknown as { spellList: FakeElement }).spellList;
    const firstCard = spellList.children[0];

    firstCard.dispatch('mouseenter');
    firstCard.dispatch('mouseleave');
    firstCard.dispatch('focus');
    firstCard.dispatch('click');

    expect(previews).toEqual(['shadow_dart', null, 'shadow_dart', 'shadow_dart']);
  });

  it('renders the dark character-selection shell with roster, unit stats, and abilities', () => {
    const root = new FakeElement();
    const overlay = new CharacterSelectOverlay(root as unknown as HTMLElement);

    expect(overlay.element.innerHTML).toContain('character-select__roster-card');
    expect(overlay.element.innerHTML).toContain('character-select__stat-list');
    expect(overlay.element.innerHTML).toContain('UNIT STATS');
    expect(overlay.element.innerHTML).toContain('ABILITIES');
    expect(overlay.element.innerHTML).toContain('profile-modal');
  });
});
