import { describe, expect, it } from 'vitest';
import {
  COMBAT_KEYBINDINGS_STORAGE_KEY,
  DEFAULT_COMBAT_KEY_BINDINGS,
  assignCombatKeyBinding,
  formatCombatKeyBinding,
  loadCombatKeyBindings,
  resolveCombatSpellForClass,
  saveCombatKeyBindings,
  type CombatKeyBindingsStorage
} from './CombatKeyBindings';

function memoryStorage(initial?: string): CombatKeyBindingsStorage & { value: string | null } {
  return {
    value: initial ?? null,
    getItem(key: string) {
      return key === COMBAT_KEYBINDINGS_STORAGE_KEY ? this.value : null;
    },
    setItem(key: string, value: string) {
      if (key === COMBAT_KEYBINDINGS_STORAGE_KEY) {
        this.value = value;
      }
    }
  };
}

describe('CombatKeyBindings', () => {
  it('loads the default spell keys when storage is empty or invalid', () => {
    expect(loadCombatKeyBindings(memoryStorage())).toEqual(DEFAULT_COMBAT_KEY_BINDINGS);
    expect(loadCombatKeyBindings(memoryStorage('{bad json'))).toEqual(DEFAULT_COMBAT_KEY_BINDINGS);
  });

  it('persists custom bindings and resolves spells through the active class slots', () => {
    const storage = memoryStorage();
    const custom = assignCombatKeyBinding(DEFAULT_COMBAT_KEY_BINDINGS, 'spell1', { code: 'KeyQ', key: 'q' });
    const saved = saveCombatKeyBindings(custom, storage);

    expect(storage.value).toBe(JSON.stringify(saved));
    expect(loadCombatKeyBindings(storage)).toEqual(saved);
    expect(resolveCombatSpellForClass('arcanist', { code: 'KeyQ', key: 'q' }, saved)).toBe('shadow_dart');
    expect(resolveCombatSpellForClass('divine', { code: 'KeyQ', key: 'q' }, saved)).toBe('judgment_ray');
  });

  it('keeps combat bindings distinct by swapping duplicate assignments', () => {
    const bindings = assignCombatKeyBinding(DEFAULT_COMBAT_KEY_BINDINGS, 'spell1', { code: 'Digit2', key: '2' });

    expect(bindings.spell1.code).toBe('Digit2');
    expect(bindings.spell2.code).toBe('Digit1');
  });

  it('rejects reserved movement and system keys for spell assignment', () => {
    expect(assignCombatKeyBinding(DEFAULT_COMBAT_KEY_BINDINGS, 'spell1', { code: 'KeyW', key: 'w' })).toEqual(DEFAULT_COMBAT_KEY_BINDINGS);
    expect(assignCombatKeyBinding(DEFAULT_COMBAT_KEY_BINDINGS, 'spell1', { code: 'Escape', key: 'Escape' })).toEqual(DEFAULT_COMBAT_KEY_BINDINGS);
  });

  it('formats binding labels for HUD and settings display', () => {
    expect(formatCombatKeyBinding({ code: 'Digit1', key: '1' })).toBe('1');
    expect(formatCombatKeyBinding({ code: 'KeyQ', key: 'q' })).toBe('Q');
    expect(formatCombatKeyBinding({ code: 'BracketLeft', key: '[' })).toBe('[');
  });
});
