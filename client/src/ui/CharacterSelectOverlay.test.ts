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
  className = '';
  textContent = '';

  set innerHTML(_value: string) {
    this.classNodes.clear();
    for (const selector of [
      '.character-select__back',
      '.character-select__preview-area',
      '[data-class="arcanist"]',
      '[data-class="divine"]',
      '.character-select__spell-list',
      '.character-select__confirm',
      '.character-select__class-desc',
      '.character-select__class-title',
      '.character-select__mode',
      '.character-select__arena',
      '.character-select__confirm small'
    ]) {
      this.classNodes.set(selector, new FakeElement());
    }
  }

  get innerHTML(): string {
    return '';
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  querySelector(selector: string): FakeElement | null {
    return this.classNodes.get(selector) ?? null;
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
});
