import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SPELL_IDS } from '../../../shared/spells';
import {
  AUDIO_CHANNELS,
  AUDIO_CATALOG,
  getAudioAsset,
  listAudioIdsByChannel,
  spellAudioId
} from './AudioCatalog';

describe('AudioCatalog', () => {
  it('defines the required mixer channels', () => {
    expect(AUDIO_CHANNELS).toEqual(['music', 'ambience', 'sfx', 'ui', 'voice']);
  });

  it('resolves stable manifest ids to public audio files', () => {
    expect(getAudioAsset('music.lobby')).toMatchObject({
      channel: 'music',
      loop: true
    });
    expect(getAudioAsset('announcer.victory')).toMatchObject({
      channel: 'voice'
    });
    expect(getAudioAsset('missing.sound')).toBeNull();
  });

  it('uses the canonical serious movement jump takeoff asset', () => {
    expect(getAudioAsset('movement.jump')?.src).toEqual(['/audio/sfx/movement/jump.ogg']);
  });

  it('groups ids by channel without exposing other channels', () => {
    expect(listAudioIdsByChannel('voice')).toEqual(expect.arrayContaining([
      'announcer.victory',
      'announcer.defeat',
      'announcer.duel_begins'
    ]));
    expect(listAudioIdsByChannel('voice')).not.toContain('music.lobby');
  });

  it('contains cast and impact sounds for every spell id', () => {
    for (const spellId of SPELL_IDS) {
      const castId = spellAudioId(spellId, 'cast');
      const impactId = spellAudioId(spellId, 'impact');
      expect(AUDIO_CATALOG[castId]).toMatchObject({ channel: 'sfx' });
      expect(AUDIO_CATALOG[impactId]).toMatchObject({ channel: 'sfx' });
    }
  });

  it('points every catalog source at a public audio asset', () => {
    const publicRoot = new URL('../../public/', import.meta.url);

    for (const [id, asset] of Object.entries(AUDIO_CATALOG)) {
      for (const src of asset.src) {
        const fileUrl = new URL(src.replace(/^\/+/, ''), publicRoot);
        expect(existsSync(fileURLToPath(fileUrl)), `${id} -> ${src}`).toBe(true);
      }
    }
  });
});
