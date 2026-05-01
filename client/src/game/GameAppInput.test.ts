import { describe, expect, it } from 'vitest';
import {
  clampMediaVolume,
  createQualitySettingsAudioProps,
  createDifferentMatchQueueIntent,
  normalizeDamageAmount,
  resolveDevHotkeyAction,
  resolveKeyboardSpellForClass,
  resolveMatchResultKind,
  sceneSupportsLocalDash,
  shouldDisposeArenaBeforeEnterMatch
} from './GameApp';

describe('GameApp keyboard spell slots', () => {
  it('resolves number keys as legacy fallback spell slots', () => {
    expect(resolveKeyboardSpellForClass('arcanist', '1')).toBe('shadow_dart');
    expect(resolveKeyboardSpellForClass('arcanist', '4')).toBe('eclipse');
    expect(resolveKeyboardSpellForClass('divine', '1')).toBe('judgment_ray');
    expect(resolveKeyboardSpellForClass('divine', '4')).toBe('firmament_shield');
  });

  it('resolves the default mouse and Q/E attack set through active class slots', () => {
    expect(resolveKeyboardSpellForClass('arcanist', { button: 0 })).toBe('shadow_dart');
    expect(resolveKeyboardSpellForClass('arcanist', { button: 2 })).toBe('void_trap');
    expect(resolveKeyboardSpellForClass('arcanist', { code: 'KeyQ', key: 'q' })).toBe('abyssal_claw');
    expect(resolveKeyboardSpellForClass('arcanist', { code: 'KeyE', key: 'e' })).toBe('eclipse');
    expect(resolveKeyboardSpellForClass('divine', { code: 'KeyQ', key: 'q' })).toBe('glacial_spikes');
    expect(resolveKeyboardSpellForClass('divine', { code: 'KeyE', key: 'e' })).toBe('firmament_shield');
  });

  it('resolves custom combat key bindings through the active character class slots', () => {
    const bindings = {
      spell1: { code: 'KeyQ', key: 'q' },
      spell2: { code: 'KeyE', key: 'e' },
      spell3: { code: 'KeyF', key: 'f' },
      spell4: { code: 'KeyG', key: 'g' }
    };

    expect(resolveKeyboardSpellForClass('arcanist', { code: 'KeyQ', key: 'q' }, bindings)).toBe('shadow_dart');
    expect(resolveKeyboardSpellForClass('arcanist', { code: 'KeyG', key: 'g' }, bindings)).toBe('eclipse');
    expect(resolveKeyboardSpellForClass('divine', { code: 'KeyF', key: 'f' }, bindings)).toBe('glacial_spikes');
  });

  it('ignores keys outside the four class slots', () => {
    expect(resolveKeyboardSpellForClass('divine', '5')).toBeNull();
    expect(resolveKeyboardSpellForClass('divine', 'f')).toBeNull();
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

  it('disposes an existing arena when rematch returns from results into match flow', () => {
    expect(shouldDisposeArenaBeforeEnterMatch('RESULTS', true)).toBe(true);
    expect(shouldDisposeArenaBeforeEnterMatch('MATCH', true)).toBe(false);
    expect(shouldDisposeArenaBeforeEnterMatch('RESULTS', false)).toBe(false);
  });

  it('resolves protected dev hotkeys without gating calibration exit', () => {
    expect(resolveDevHotkeyAction('f8', 'LOBBY')).toBe('enter-calibration');
    expect(resolveDevHotkeyAction('f8', 'CALIBRATION')).toBe('exit-calibration');
    expect(resolveDevHotkeyAction('f9', 'LOBBY')).toBe('enter-vfx-editor');
    expect(resolveDevHotkeyAction('f9', 'MATCH')).toBeNull();
  });

  it('wires settings modal audio changes back into AudioManager persistence', () => {
    const calls: unknown[] = [];
    const current = {
      muted: false,
      master: 0.82,
      channels: {
        music: 0.78,
        ambience: 0.28,
        sfx: 0.64,
        ui: 0.78,
        voice: 0.92
      }
    };
    const props = createQualitySettingsAudioProps({
      getSettings: () => current,
      updateSettings: (settings) => calls.push(settings)
    });

    props.onAudioSettingsChange({ ...current, master: 0.4 });

    expect(props.audioSettings).toBe(current);
    expect(calls).toEqual([{ ...current, master: 0.4 }]);
  });
});
