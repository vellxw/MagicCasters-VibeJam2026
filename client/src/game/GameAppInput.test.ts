import { describe, expect, it } from 'vitest';
import { normalizeDamageAmount, resolveKeyboardSpellForClass } from './GameApp';

describe('GameApp keyboard spell slots', () => {
  it('resolves number keys through the active character class slots', () => {
    expect(resolveKeyboardSpellForClass('arcanist', '1')).toBe('shadow_dart');
    expect(resolveKeyboardSpellForClass('arcanist', '4')).toBe('eclipse');
    expect(resolveKeyboardSpellForClass('divine', '1')).toBe('judgment_ray');
    expect(resolveKeyboardSpellForClass('divine', '4')).toBe('firmament_shield');
  });

  it('ignores keys outside the four class slots', () => {
    expect(resolveKeyboardSpellForClass('divine', '5')).toBeNull();
    expect(resolveKeyboardSpellForClass('divine', 'q')).toBeNull();
  });

  it('normalizes canonical and legacy damage payloads for combat toasts', () => {
    expect(normalizeDamageAmount({ amount: 18, damage: undefined })).toBe(18);
    expect(normalizeDamageAmount({ damage: 18 })).toBe(18);
    expect(normalizeDamageAmount({ amount: Number.NaN, damage: undefined })).toBeNull();
  });
});
