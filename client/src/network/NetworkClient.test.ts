import { describe, expect, it } from 'vitest';
import { ROOM_NAME } from '../../../shared/types';
import { createJoinOptions } from './NetworkClient';

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
});
