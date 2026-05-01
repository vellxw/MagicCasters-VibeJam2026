import { AUDIO_CHANNELS, type AudioChannel } from './AudioCatalog';

export const AUDIO_SETTINGS_STORAGE_KEY = 'mc_audio_settings_v1';

export interface AudioSettings {
  muted: boolean;
  master: number;
  channels: Record<AudioChannel, number>;
}

export interface AudioSettingsStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  muted: false,
  master: 0.82,
  channels: {
    music: 0.74,
    ambience: 0.58,
    sfx: 0.86,
    ui: 0.78,
    voice: 0.92
  }
};

export function clampAudioVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(value, 0), 1)
    : 0;
}

export function normalizeAudioSettings(value: unknown): AudioSettings {
  const source = typeof value === 'object' && value !== null ? value as Partial<AudioSettings> : {};
  const sourceChannels = typeof source.channels === 'object' && source.channels !== null
    ? source.channels as Partial<Record<AudioChannel, number>>
    : {};

  const channels = { ...DEFAULT_AUDIO_SETTINGS.channels };
  for (const channel of AUDIO_CHANNELS) {
    if (sourceChannels[channel] !== undefined) {
      channels[channel] = clampAudioVolume(sourceChannels[channel]);
    }
  }

  return {
    muted: typeof source.muted === 'boolean' ? source.muted : DEFAULT_AUDIO_SETTINGS.muted,
    master: source.master !== undefined ? clampAudioVolume(source.master) : DEFAULT_AUDIO_SETTINGS.master,
    channels
  };
}

export function loadAudioSettings(storage = browserStorage()): AudioSettings {
  if (!storage) return DEFAULT_AUDIO_SETTINGS;
  const raw = storage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
  if (!raw) return DEFAULT_AUDIO_SETTINGS;
  try {
    return normalizeAudioSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

export function saveAudioSettings(storage: AudioSettingsStorage | null, settings: AudioSettings): AudioSettings {
  const normalized = normalizeAudioSettings(settings);
  storage?.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function browserStorage(): AudioSettingsStorage | null {
  return typeof window !== 'undefined' ? window.localStorage : null;
}
