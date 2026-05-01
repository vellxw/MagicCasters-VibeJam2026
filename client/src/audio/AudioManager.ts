import { Howl, Howler } from 'howler';
import {
  AUDIO_CATALOG,
  getAudioAsset,
  type AudioAsset,
  type AudioChannel,
  type AudioId
} from './AudioCatalog';
import {
  loadAudioSettings,
  saveAudioSettings,
  type AudioSettings,
  type AudioSettingsStorage
} from './AudioSettings';
import type { AudioCue } from './AudioEventRouter';

export interface AudioHowlOptions {
  src: string[];
  loop?: boolean;
  volume?: number;
  preload?: boolean;
  html5?: boolean;
  onloaderror?: () => void;
  onplayerror?: () => void;
}

export interface AudioHowlLike {
  play: () => number | string;
  stop: (id?: number | string) => void;
  fade: (from: number, to: number, duration: number, id?: number | string) => void;
  volume: (value: number) => void;
  mute: (muted: boolean) => void;
  unload: () => void;
  pos?: (x: number, y: number, z: number, id?: number | string) => void;
}

export type AudioHowlCtor = new (options: AudioHowlOptions) => AudioHowlLike;

export interface AudioManagerOptions {
  storage?: AudioSettingsStorage | null;
  HowlCtor?: AudioHowlCtor;
  now?: () => number;
  speechSynthesis?: SpeechSynthesis | null;
}

export class AudioManager {
  private sounds = new Map<AudioId, AudioHowlLike>();
  private lastPlayed = new Map<AudioId, number>();
  private settings: AudioSettings;
  private currentMusic: AudioId | null = null;
  private currentAmbience: AudioId | null = null;
  private speechSynthesis: SpeechSynthesis | null;

  constructor(private options: AudioManagerOptions = {}) {
    this.settings = loadAudioSettings(options.storage);
    this.speechSynthesis = options.speechSynthesis ?? (typeof window !== 'undefined' ? window.speechSynthesis : null);
  }

  getSettings(): AudioSettings {
    return {
      ...this.settings,
      channels: { ...this.settings.channels }
    };
  }

  preload(): void {
    for (const id of Object.keys(AUDIO_CATALOG) as AudioId[]) {
      const asset = AUDIO_CATALOG[id];
      if (asset.preload) this.getOrCreateSound(id, asset);
    }
  }

  unlock(): void {
    const ctx = (Howler as unknown as { ctx?: AudioContext }).ctx;
    if (ctx?.state === 'suspended') {
      void ctx.resume();
    }
  }

  setMuted(muted: boolean): void {
    this.updateSettings({ ...this.settings, muted });
  }

  setMasterVolume(volume: number): void {
    this.updateSettings({ ...this.settings, master: volume });
  }

  setChannelVolume(channel: AudioChannel, volume: number): void {
    this.updateSettings({
      ...this.settings,
      channels: {
        ...this.settings.channels,
        [channel]: volume
      }
    });
  }

  updateSettings(settings: AudioSettings): void {
    this.settings = saveAudioSettings(this.options.storage ?? null, settings);
    this.applySettingsToLoadedSounds();
  }

  playCues(cues: AudioCue[]): void {
    for (const cue of cues) {
      this.playCue(cue);
    }
  }

  playCue(cue: AudioCue): void {
    if (cue.mode === 'music') {
      this.playMusic(cue.id);
      return;
    }
    if (cue.mode === 'ambience') {
      this.playAmbience(cue.id);
      return;
    }
    this.play(cue.id, cue);
  }

  play(id: AudioId, cue: Pick<AudioCue, 'position' | 'force'> = {}): number | string | null {
    const asset = getAudioAsset(id);
    if (!asset) return null;
    if (!cue.force && this.isCoolingDown(id, asset)) return null;

    const sound = this.getOrCreateSound(id, asset);
    this.lastPlayed.set(id, this.now());
    const instanceId = sound.play();
    if (cue.position && sound.pos) {
      sound.pos(cue.position.x, cue.position.y, cue.position.z, instanceId);
    }
    return instanceId;
  }

  playMusic(id: AudioId): void {
    this.playLoopingChannel(id, 'music');
  }

  playAmbience(id: AudioId): void {
    this.playLoopingChannel(id, 'ambience');
  }

  stopMusic(): void {
    this.stopCurrentLoop('music');
  }

  stopAmbience(): void {
    this.stopCurrentLoop('ambience');
  }

  stopAll(): void {
    for (const sound of this.sounds.values()) {
      sound.stop();
    }
    this.currentMusic = null;
    this.currentAmbience = null;
  }

  dispose(): void {
    for (const sound of this.sounds.values()) {
      sound.unload();
    }
    this.sounds.clear();
    this.currentMusic = null;
    this.currentAmbience = null;
  }

  private playLoopingChannel(id: AudioId, channel: 'music' | 'ambience'): void {
    const asset = getAudioAsset(id);
    if (!asset || asset.channel !== channel) return;
    const current = channel === 'music' ? this.currentMusic : this.currentAmbience;
    if (current === id) return;

    this.stopCurrentLoop(channel);
    const sound = this.getOrCreateSound(id, asset);
    const targetVolume = this.effectiveVolume(asset);
    sound.volume(0);
    const instanceId = sound.play();
    sound.fade(0, targetVolume, asset.fadeMs ?? 700, instanceId);

    if (channel === 'music') this.currentMusic = id;
    else this.currentAmbience = id;
  }

  private stopCurrentLoop(channel: 'music' | 'ambience'): void {
    const id = channel === 'music' ? this.currentMusic : this.currentAmbience;
    if (!id) return;
    const asset = getAudioAsset(id);
    const sound = this.sounds.get(id);
    if (asset && sound) {
      sound.fade(this.effectiveVolume(asset), 0, asset.fadeMs ?? 700);
      globalThis.setTimeout?.(() => sound.stop(), asset.fadeMs ?? 700);
    }
    if (channel === 'music') this.currentMusic = null;
    else this.currentAmbience = null;
  }

  private getOrCreateSound(id: AudioId, asset: AudioAsset): AudioHowlLike {
    const existing = this.sounds.get(id);
    if (existing) return existing;

    const Ctor = this.options.HowlCtor ?? (Howl as unknown as AudioHowlCtor);
    const sound = new Ctor({
      src: asset.src,
      loop: asset.loop,
      volume: this.effectiveVolume(asset),
      preload: asset.preload,
      html5: asset.channel === 'music',
      onloaderror: () => this.speakFallback(asset),
      onplayerror: () => this.speakFallback(asset)
    });
    sound.mute(this.settings.muted);
    this.sounds.set(id, sound);
    return sound;
  }

  private isCoolingDown(id: AudioId, asset: AudioAsset): boolean {
    const cooldown = asset.cooldownMs ?? 0;
    if (cooldown <= 0) return false;
    const last = this.lastPlayed.get(id);
    return last !== undefined && this.now() - last < cooldown;
  }

  private effectiveVolume(asset: AudioAsset): number {
    return this.settings.muted
      ? 0
      : asset.volume * this.settings.master * this.settings.channels[asset.channel];
  }

  private applySettingsToLoadedSounds(): void {
    for (const [id, sound] of this.sounds) {
      const asset = AUDIO_CATALOG[id];
      sound.mute(this.settings.muted);
      sound.volume(this.effectiveVolume(asset));
    }
  }

  private speakFallback(asset: AudioAsset): void {
    if (asset.channel !== 'voice' || !asset.fallbackText || !this.speechSynthesis || this.settings.muted) return;
    try {
      const utterance = new SpeechSynthesisUtterance(asset.fallbackText);
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
      utterance.pitch = 0.75;
      utterance.volume = this.settings.master * this.settings.channels.voice;
      this.speechSynthesis.speak(utterance);
    } catch {
      // Voice fallback is non-critical.
    }
  }

  private now(): number {
    return this.options.now?.() ?? performance.now();
  }
}
