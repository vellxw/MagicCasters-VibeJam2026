import { describe, expect, it } from 'vitest';
import {
  clampMediaVolume,
  createDifferentMatchQueueIntent,
  normalizeDamageAmount,
  resolveDevHotkeyAction,
  resolveKeyboardSpellForClass,
  resolveMatchResultKind,
  sceneSupportsLocalDash
} from './GameApp';

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

  it('clamps audio fade volume to the media element range', () => {
    expect(clampMediaVolume(-0.00815)).toBe(0);
    expect(clampMediaVolume(0.42)).toBe(0.42);
    expect(clampMediaVolume(1.12)).toBe(1);
  });

  it('resolves victory only when the local team matches the winning team', () => {
    expect(resolveMatchResultKind({ teamId: 'A' }, 'A')).toBe('victory');
    expect(resolveMatchResultKind({ teamId: 'B' }, 'A')).toBe('defeat');
    expect(resolveMatchResultKind(undefined, 'A')).toBe('defeat');
    expect(resolveMatchResultKind({ teamId: 'A' }, '')).toBe('defeat');
  });

  it('queues a different public match in the same selected mode', () => {
    expect(createDifferentMatchQueueIntent('2v2')).toEqual({
      mode: '2v2',
      request: { kind: 'public' }
    });
    expect(createDifferentMatchQueueIntent(null)).toEqual({
      mode: '1v1',
      request: { kind: 'public' }
    });
  });

  it('allows local air dash in lobby traversal scenes as well as matches', () => {
    expect(sceneSupportsLocalDash('LOBBY')).toBe(true);
    expect(sceneSupportsLocalDash('QUEUE')).toBe(true);
    expect(sceneSupportsLocalDash('MATCH')).toBe(true);
    expect(sceneSupportsLocalDash('CHARACTER_SELECT')).toBe(false);
    expect(sceneSupportsLocalDash('CUSTOM')).toBe(false);
  });

  it('resolves protected dev hotkeys without gating calibration exit', () => {
    expect(resolveDevHotkeyAction('f8', 'LOBBY')).toBe('enter-calibration');
    expect(resolveDevHotkeyAction('f8', 'CALIBRATION')).toBe('exit-calibration');
    expect(resolveDevHotkeyAction('f9', 'LOBBY')).toBe('enter-vfx-editor');
    expect(resolveDevHotkeyAction('f9', 'MATCH')).toBeNull();
  });
});
