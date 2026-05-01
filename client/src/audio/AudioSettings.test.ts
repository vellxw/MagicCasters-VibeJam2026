import { describe, expect, it } from 'vitest';
import {
  AUDIO_SETTINGS_STORAGE_KEY,
  DEFAULT_AUDIO_SETTINGS,
  clampAudioVolume,
  loadAudioSettings,
  normalizeAudioSettings,
  saveAudioSettings,
  type AudioSettingsStorage
} from './AudioSettings';

function memoryStorage(initial?: string): AudioSettingsStorage & { value: string | null } {
  return {
    value: initial ?? null,
    getItem() {
      return this.value;
    },
    setItem(_key: string, value: string) {
      this.value = value;
    }
  };
}

describe('AudioSettings', () => {
  it('clamps volume values to the media-safe range', () => {
    expect(clampAudioVolume(-0.25)).toBe(0);
    expect(clampAudioVolume(0.4)).toBe(0.4);
    expect(clampAudioVolume(2)).toBe(1);
    expect(clampAudioVolume(Number.NaN)).toBe(0);
  });

  it('normalizes partial persisted settings against defaults', () => {
    expect(normalizeAudioSettings({
      muted: true,
      master: 1.2,
      channels: {
        music: 0.25,
        sfx: -1
      }
    })).toEqual({
      ...DEFAULT_AUDIO_SETTINGS,
      muted: true,
      master: 1,
      channels: {
        ...DEFAULT_AUDIO_SETTINGS.channels,
        music: 0.25,
        sfx: 0
      }
    });
  });

  it('loads defaults when storage is empty or invalid', () => {
    expect(loadAudioSettings(memoryStorage())).toEqual(DEFAULT_AUDIO_SETTINGS);
    expect(loadAudioSettings(memoryStorage('{bad json'))).toEqual(DEFAULT_AUDIO_SETTINGS);
  });

  it('defaults ambience and combat SFX below music so the soundtrack leads', () => {
    expect(DEFAULT_AUDIO_SETTINGS.channels.music).toBeGreaterThan(DEFAULT_AUDIO_SETTINGS.channels.ambience);
    expect(DEFAULT_AUDIO_SETTINGS.channels.sfx).toBeLessThanOrEqual(0.68);
    expect(DEFAULT_AUDIO_SETTINGS.channels.ambience).toBeLessThanOrEqual(0.32);
  });

  it('saves normalized settings to the configured storage key', () => {
    const storage = memoryStorage();
    const saved = saveAudioSettings(storage, {
      ...DEFAULT_AUDIO_SETTINGS,
      master: 0.3333,
      channels: {
        ...DEFAULT_AUDIO_SETTINGS.channels,
        voice: 2
      }
    });

    expect(saved.channels.voice).toBe(1);
    expect(storage.value).toBe(JSON.stringify(saved));
    expect(loadAudioSettings({
      getItem(key: string) {
        return key === AUDIO_SETTINGS_STORAGE_KEY ? storage.value : null;
      },
      setItem() {}
    })).toEqual(saved);
  });
});
