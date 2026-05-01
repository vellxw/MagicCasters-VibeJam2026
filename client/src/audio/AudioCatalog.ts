import { SPELL_IDS, type SpellId } from '../../../shared/spells';

export const AUDIO_CHANNELS = ['music', 'ambience', 'sfx', 'ui', 'voice'] as const;

export type AudioChannel = (typeof AUDIO_CHANNELS)[number];
export type SpellAudioMoment = 'cast' | 'impact';

export interface AudioAsset {
  channel: AudioChannel;
  src: string[];
  volume: number;
  loop?: boolean;
  fadeMs?: number;
  cooldownMs?: number;
  preload?: boolean;
  fallbackText?: string;
}

const spellEntries = Object.fromEntries(
  SPELL_IDS.flatMap((spellId) => [
    [
      spellAudioIdUnchecked(spellId, 'cast'),
      sfx(`/audio/sfx/spells/${spellId}-cast.ogg`, 0.82, 75)
    ],
    [
      spellAudioIdUnchecked(spellId, 'impact'),
      sfx(`/audio/sfx/spells/${spellId}-impact.ogg`, 0.9, 60)
    ]
  ])
) as Record<`spell.${SpellId}.${SpellAudioMoment}`, AudioAsset>;

export const AUDIO_CATALOG = {
  'music.lobby': music('/audio/music/lobby-music.mp3', 0.62),
  'music.match': music('/audio/music/match-loop.mp3', 0.54),
  'ambience.lobby': ambience('/audio/ambience/lobby-embers.ogg', 0.42),
  'ambience.match': ambience('/audio/ambience/match-wind.ogg', 0.38),

  'ui.confirm': ui('/audio/ui/confirm.ogg', 0.72, 55),
  'ui.denied': ui('/audio/ui/denied.ogg', 0.72, 140),
  'ui.queue': ui('/audio/ui/queue.ogg', 0.68, 220),
  'ui.countdown': ui('/audio/ui/countdown.ogg', 0.7, 260),
  'ui.portal': ui('/audio/ui/portal.ogg', 0.76, 280),

  'movement.jump': sfx('/audio/sfx/movement/jump.ogg', 0.72, 150),
  'movement.land': sfx('/audio/sfx/movement/land.ogg', 0.66, 140),
  'movement.dash': sfx('/audio/sfx/movement/dash.ogg', 0.78, 180),
  'combat.damage_taken': sfx('/audio/sfx/combat/damage-taken.ogg', 0.72, 120),
  'combat.final_blow': sfx('/audio/sfx/combat/final-blow.ogg', 0.9, 500),
  'status.mark_applied': sfx('/audio/sfx/status/mark-applied.ogg', 0.72, 160),
  'status.mark_consumed': sfx('/audio/sfx/status/mark-consumed.ogg', 0.8, 160),

  ...spellEntries,

  'announcer.victory': voice('/audio/voice/victory.mp3', 'Victory'),
  'announcer.defeat': voice('/audio/voice/defeat.mp3', 'Defeat'),
  'announcer.duel_begins': voice('/audio/voice/duel-begins.mp3', 'Duel begins'),
  'announcer.choose_your_mage': voice('/audio/voice/choose-your-mage.mp3', 'Choose your mage'),
  'announcer.enemy_marked': voice('/audio/voice/enemy-marked.mp3', 'Enemy marked'),
  'announcer.shield_broken': voice('/audio/voice/shield-broken.mp3', 'Shield broken'),
  'announcer.final_blow': voice('/audio/voice/final-blow.mp3', 'Final blow')
} as const satisfies Record<string, AudioAsset>;

export type AudioId = keyof typeof AUDIO_CATALOG;

export function getAudioAsset(id: string): AudioAsset | null {
  return Object.prototype.hasOwnProperty.call(AUDIO_CATALOG, id)
    ? AUDIO_CATALOG[id as AudioId]
    : null;
}

export function listAudioIdsByChannel(channel: AudioChannel): AudioId[] {
  return (Object.keys(AUDIO_CATALOG) as AudioId[]).filter((id) => AUDIO_CATALOG[id].channel === channel);
}

export function spellAudioId(spellId: SpellId, moment: SpellAudioMoment): AudioId {
  return spellAudioIdUnchecked(spellId, moment) as AudioId;
}

function spellAudioIdUnchecked(spellId: SpellId, moment: SpellAudioMoment): `spell.${SpellId}.${SpellAudioMoment}` {
  return `spell.${spellId}.${moment}`;
}

function music(src: string, volume: number): AudioAsset {
  return { channel: 'music', src: [src], volume, loop: true, fadeMs: 900, preload: true };
}

function ambience(src: string, volume: number): AudioAsset {
  return { channel: 'ambience', src: [src], volume, loop: true, fadeMs: 1000, preload: true };
}

function sfx(src: string, volume: number, cooldownMs: number): AudioAsset {
  return { channel: 'sfx', src: [src], volume, cooldownMs, preload: true };
}

function ui(src: string, volume: number, cooldownMs: number): AudioAsset {
  return { channel: 'ui', src: [src], volume, cooldownMs, preload: true };
}

function voice(src: string, fallbackText: string): AudioAsset {
  return {
    channel: 'voice',
    src: [src],
    volume: 0.92,
    cooldownMs: 700,
    preload: true,
    fallbackText
  };
}
