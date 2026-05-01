import { describe, expect, it } from 'vitest';
import { ROOM_NAME } from '../../../shared/types';
import { createJoinOptions, SERVER_MESSAGE_TYPES } from './NetworkClient';

describe('NetworkClient join options', () => {
  it('includes the selected character class when joining the match room', () => {
    expect(createJoinOptions('Mage 101', '2v2', 'divine')).toEqual({
      roomName: ROOM_NAME,
      options: {
        name: 'Mage 101',
        mode: '2v2',
        characterClass: 'divine',
        partyCode: ''
      }
    });
  });

  it('includes custom room code and selected map when creating an invite match', () => {
    expect(createJoinOptions('Mage 202', '1v1', 'arcanist', {
      partyCode: 'AB12CD',
      arenaPresetId: 'the-dragon-gate-bridge',
      botSkill: 'novice',
      minHumanPlayers: 2,
      botCount: 2
    })).toEqual({
      roomName: ROOM_NAME,
      options: {
        name: 'Mage 202',
        mode: '1v1',
        characterClass: 'arcanist',
        partyCode: 'AB12CD',
        arenaPresetId: 'the-dragon-gate-bridge',
        botSkill: 'novice',
        minHumanPlayers: 2,
        botCount: 2,
        custom: true
      }
    });
  });

  it('does not send a bot skill for public matchmaking', () => {
    expect(createJoinOptions('Mage 303', '2v2', 'divine', {
      botSkill: 'master'
    })).toEqual({
      roomName: ROOM_NAME,
      options: {
        name: 'Mage 303',
        mode: '2v2',
        characterClass: 'divine',
        partyCode: ''
      }
    });
  });

  it('subscribes to explicit spell resolution events', () => {
    expect(SERVER_MESSAGE_TYPES).toEqual(expect.arrayContaining([
      'spell_confirmed',
      'projectile_impact',
      'trap_placed',
      'trap_triggered',
      'mark_applied',
      'mark_consumed',
      'ground_line_hit',
      'glacial_spike_telegraph',
      'glacial_spike_erupted',
      'shield_exploded',
      'bot_added'
    ]));
  });
});
