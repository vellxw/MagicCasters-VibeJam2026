import { describe, expect, it } from 'vitest';
import {
  audioCuesForMatchResult,
  audioCuesForNetEvent,
  audioCuesForPhase
} from './AudioEventRouter';

describe('AudioEventRouter', () => {
  it('routes spell casts and impacts to spell-specific cues with positions', () => {
    expect(audioCuesForNetEvent('spell_confirmed', {
      spellId: 'shadow_dart',
      x: 1,
      y: 2,
      z: 3
    })).toEqual([{
      id: 'spell.shadow_dart.cast',
      position: { x: 1, y: 2, z: 3 }
    }]);

    expect(audioCuesForNetEvent('projectile_impact', {
      spellId: 'judgment_ray',
      x: -1,
      y: 0.5,
      z: 4
    })).toEqual([{
      id: 'spell.judgment_ray.impact',
      position: { x: -1, y: 0.5, z: 4 }
    }]);
  });

  it('routes combat network events to readable gameplay sounds', () => {
    expect(audioCuesForNetEvent('cast_denied', {})).toEqual([{ id: 'ui.denied' }]);
    expect(audioCuesForNetEvent('trap_triggered', { x: 2, z: -3 })).toEqual([
      { id: 'spell.void_trap.impact', position: { x: 2, y: 0, z: -3 } }
    ]);
    expect(audioCuesForNetEvent('mark_applied', {
      targetId: 'enemy',
      x: 0,
      z: 1
    }, { localSessionId: 'local' })).toEqual([
      { id: 'status.mark_applied', position: { x: 0, y: 0, z: 1 } },
      { id: 'announcer.enemy_marked' }
    ]);
    expect(audioCuesForNetEvent('shield_exploded', { x: 4, z: 5 })).toEqual([
      { id: 'spell.firmament_shield.impact', position: { x: 4, y: 0, z: 5 } },
      { id: 'announcer.shield_broken' }
    ]);
  });

  it('routes phase transitions and match results to music and announcer cues', () => {
    expect(audioCuesForPhase('COUNTDOWN')).toEqual([{ id: 'ui.countdown' }]);
    expect(audioCuesForPhase('PLAYING')).toEqual([
      { id: 'announcer.duel_begins' },
      { id: 'music.match', mode: 'music' },
      { id: 'ambience.match', mode: 'ambience' }
    ]);

    expect(audioCuesForMatchResult({
      winnerId: 'local',
      localSessionId: 'local'
    })).toEqual([{ id: 'announcer.victory' }]);
    expect(audioCuesForMatchResult({
      winnerId: 'enemy',
      localSessionId: 'local'
    })).toEqual([{ id: 'announcer.defeat' }]);
  });

  it('selects arena-specific match music based on preset id', () => {
    expect(audioCuesForPhase('PLAYING', { arenaPresetId: 'grand-medieval-castle-courtyard-high' })).toEqual([
      { id: 'announcer.duel_begins' },
      { id: 'music.match.arcane', mode: 'music' },
      { id: 'ambience.match', mode: 'ambience' }
    ]);
    expect(audioCuesForPhase('PLAYING', { arenaPresetId: 'celestial-marble-crystal-palace-mid' })).toEqual([
      { id: 'announcer.duel_begins' },
      { id: 'music.match.arcane', mode: 'music' },
      { id: 'ambience.match', mode: 'ambience' }
    ]);
    expect(audioCuesForPhase('PLAYING', { arenaPresetId: 'the-dragon-gate-bridge-low' })).toEqual([
      { id: 'announcer.duel_begins' },
      { id: 'music.match.arcane', mode: 'music' },
      { id: 'ambience.match', mode: 'ambience' }
    ]);
    expect(audioCuesForPhase('PLAYING', { arenaPresetId: 'ruined-palace-of-purple-crystals-high' })).toEqual([
      { id: 'announcer.duel_begins' },
      { id: 'music.match.aether', mode: 'music' },
      { id: 'ambience.match', mode: 'ambience' }
    ]);
    expect(audioCuesForPhase('PLAYING', { arenaPresetId: 'the-arcane-ritual-library-mid' })).toEqual([
      { id: 'announcer.duel_begins' },
      { id: 'music.match.aether', mode: 'music' },
      { id: 'ambience.match', mode: 'ambience' }
    ]);
    expect(audioCuesForPhase('PLAYING', { arenaPresetId: 'unknown-arena-low' })).toEqual([
      { id: 'announcer.duel_begins' },
      { id: 'music.match', mode: 'music' },
      { id: 'ambience.match', mode: 'ambience' }
    ]);
    expect(audioCuesForPhase('PLAYING', { arenaPresetId: '' })).toEqual([
      { id: 'announcer.duel_begins' },
      { id: 'music.match', mode: 'music' },
      { id: 'ambience.match', mode: 'ambience' }
    ]);
  });

  it('routes potion pickups to a clear positional pickup cue', () => {
    expect(audioCuesForNetEvent('potion_collected', { x: 2, y: 0, z: -3 })).toEqual([
      { id: 'ui.confirm', position: { x: 2, y: 0, z: -3 } }
    ]);
  });
});
