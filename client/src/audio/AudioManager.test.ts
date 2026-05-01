import { describe, expect, it, vi } from 'vitest';
import { AudioManager } from './AudioManager';
import { DEFAULT_AUDIO_SETTINGS, type AudioSettingsStorage } from './AudioSettings';

class FakeHowl {
  static instances: FakeHowl[] = [];

  readonly options: { src: string[]; loop?: boolean; volume?: number };
  play = vi.fn(() => 1);
  stop = vi.fn();
  fade = vi.fn();
  volume = vi.fn();
  mute = vi.fn();
  unload = vi.fn();

  constructor(options: { src: string[]; loop?: boolean; volume?: number }) {
    this.options = options;
    FakeHowl.instances.push(this);
  }
}

function storage(): AudioSettingsStorage {
  let value: string | null = null;
  return {
    getItem() {
      return value;
    },
    setItem(_key: string, next: string) {
      value = next;
    }
  };
}

describe('AudioManager', () => {
  it('deduplicates rapid-fire one-shot sounds using catalog cooldowns', () => {
    FakeHowl.instances = [];
    const manager = new AudioManager({
      HowlCtor: FakeHowl,
      storage: storage(),
      now: () => 1000
    });

    manager.play('ui.denied');
    manager.play('ui.denied');

    expect(FakeHowl.instances).toHaveLength(1);
    expect(FakeHowl.instances[0].play).toHaveBeenCalledTimes(1);
  });

  it('persists mute and channel volume changes while updating loaded sounds', () => {
    FakeHowl.instances = [];
    const manager = new AudioManager({
      HowlCtor: FakeHowl,
      storage: storage(),
      now: () => 1000
    });

    manager.play('announcer.victory');
    manager.setMuted(true);
    manager.setChannelVolume('voice', 0.25);

    expect(manager.getSettings()).toEqual({
      ...DEFAULT_AUDIO_SETTINGS,
      muted: true,
      channels: {
        ...DEFAULT_AUDIO_SETTINGS.channels,
        voice: 0.25
      }
    });
    expect(FakeHowl.instances[0].mute).toHaveBeenCalledWith(true);
    expect(FakeHowl.instances[0].volume).toHaveBeenCalledWith(0);
  });

  it('crossfades music when switching tracks', () => {
    FakeHowl.instances = [];
    const manager = new AudioManager({
      HowlCtor: FakeHowl,
      storage: storage(),
      now: () => 1000
    });

    manager.playMusic('music.lobby');
    manager.playMusic('music.match');

    expect(FakeHowl.instances).toHaveLength(2);
    expect(FakeHowl.instances[0].fade).toHaveBeenCalled();
    expect(FakeHowl.instances[1].play).toHaveBeenCalledTimes(1);
  });
});
