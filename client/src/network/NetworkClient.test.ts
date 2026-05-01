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
        characterClass: 'divine'
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
      'shield_exploded'
    ]));
  });
});
