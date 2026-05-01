import { describe, expect, it } from 'vitest';
import {
  COMBAT_KEYBINDINGS_STORAGE_KEY,
  DEFAULT_COMBAT_KEY_BINDINGS,
  assignCombatKeyBinding,
  formatCombatKeyBinding,
  loadCombatKeyBindings,
  resolveCombatAction,
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

  it('defaults to mouse attacks and Q/E while keeping number slots as fallback inputs', () => {
    expect(DEFAULT_COMBAT_KEY_BINDINGS).toEqual({
      spell1: { code: 'MouseLeft', key: 'Mouse Left' },
      spell2: { code: 'MouseRight', key: 'Mouse Right' },
      spell3: { code: 'KeyQ', key: 'q' },
      spell4: { code: 'KeyE', key: 'e' }
    });

    expect(resolveCombatSpellForClass('arcanist', { button: 0 })).toBe('shadow_dart');
    expect(resolveCombatSpellForClass('arcanist', { button: 2 })).toBe('void_trap');
    expect(resolveCombatSpellForClass('arcanist', { code: 'KeyQ', key: 'q' })).toBe('abyssal_claw');
    expect(resolveCombatSpellForClass('arcanist', { code: 'KeyE', key: 'e' })).toBe('eclipse');

    expect(resolveCombatAction('1')).toBe('spell1');
    expect(resolveCombatAction('4')).toBe('spell4');
    expect(resolveCombatSpellForClass('divine', '1')).toBe('judgment_ray');
    expect(resolveCombatSpellForClass('divine', '4')).toBe('firmament_shield');
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
    const bindings = assignCombatKeyBinding(DEFAULT_COMBAT_KEY_BINDINGS, 'spell1', { button: 2 });

    expect(bindings.spell1.code).toBe('MouseRight');
    expect(bindings.spell2.code).toBe('MouseLeft');
  });

  it('rejects reserved movement and system keys for spell assignment', () => {
    expect(assignCombatKeyBinding(DEFAULT_COMBAT_KEY_BINDINGS, 'spell1', { code: 'KeyW', key: 'w' })).toEqual(DEFAULT_COMBAT_KEY_BINDINGS);
    expect(assignCombatKeyBinding(DEFAULT_COMBAT_KEY_BINDINGS, 'spell1', { code: 'Escape', key: 'Escape' })).toEqual(DEFAULT_COMBAT_KEY_BINDINGS);
  });

  it('formats binding labels for HUD and settings display', () => {
    expect(formatCombatKeyBinding({ code: 'MouseLeft', key: 'Mouse Left' })).toBe('LMB');
    expect(formatCombatKeyBinding({ code: 'MouseRight', key: 'Mouse Right' })).toBe('RMB');
    expect(formatCombatKeyBinding({ code: 'KeyQ', key: 'q' })).toBe('Q');
    expect(formatCombatKeyBinding({ code: 'Digit1', key: '1' })).toBe('1');
    expect(formatCombatKeyBinding({ code: 'BracketLeft', key: '[' })).toBe('[');
  });
});
