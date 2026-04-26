import { describe, expect, it } from 'vitest';
import {
  assignTeamId,
  getMatchConfig,
  getSpawnForSlot,
  normalizeMatchMode,
  phaseAfterPlayerLeave,
  shouldDamagePlayer,
  shouldLockRoom,
  shouldStartMatch
} from './MatchSystem';
import { createTestPlayer } from './SpellSystem';

describe('MatchSystem', () => {
  it('sets max clients and required players per mode', () => {
    expect(getMatchConfig('1v1')).toEqual({ mode: '1v1', maxPlayers: 2, requiredPlayers: 2 });
    expect(getMatchConfig('2v2')).toEqual({ mode: '2v2', maxPlayers: 4, requiredPlayers: 4 });
    expect(normalizeMatchMode('unknown')).toBe('1v1');
  });

  it('assigns teams in alternating order for both modes', () => {
    expect([0, 1].map((slot) => assignTeamId('1v1', slot))).toEqual(['A', 'B']);
    expect([0, 1, 2, 3].map((slot) => assignTeamId('2v2', slot))).toEqual(['A', 'B', 'A', 'B']);
  });

  it('starts and locks rooms only when each mode is full', () => {
    expect(shouldStartMatch(1, getMatchConfig('1v1'))).toBe(false);
    expect(shouldStartMatch(2, getMatchConfig('1v1'))).toBe(true);
    expect(shouldStartMatch(3, getMatchConfig('2v2'))).toBe(false);
    expect(shouldStartMatch(4, getMatchConfig('2v2'))).toBe(true);

    expect(shouldLockRoom('WAITING', 1, getMatchConfig('1v1'))).toBe(false);
    expect(shouldLockRoom('WAITING', 2, getMatchConfig('1v1'))).toBe(true);
    expect(shouldLockRoom('PLAYING', 1, getMatchConfig('2v2'))).toBe(true);
  });

  it('ends an active match when a player leaves', () => {
    expect(phaseAfterPlayerLeave('PLAYING', 1)).toBe('ENDED');
    expect(phaseAfterPlayerLeave('PLAYING', 3)).toBe('ENDED');
    expect(phaseAfterPlayerLeave('WAITING', 1)).toBe('WAITING');
    expect(phaseAfterPlayerLeave('ENDED', 1)).toBe('ENDED');
    expect(phaseAfterPlayerLeave('PLAYING', 0)).toBe('ENDED');
  });

  it('spawns teammates near each other and disables friendly fire', () => {
    expect(getSpawnForSlot('2v2', 0).x).toBeLessThan(0);
    expect(getSpawnForSlot('2v2', 2).x).toBeLessThan(0);
    expect(getSpawnForSlot('2v2', 1).x).toBeGreaterThan(0);
    expect(getSpawnForSlot('2v2', 3).x).toBeGreaterThan(0);

    const attacker = createTestPlayer('attacker', 'A');
    const ally = createTestPlayer('ally', 'A');
    const enemy = createTestPlayer('enemy', 'B');

    expect(shouldDamagePlayer(attacker, ally)).toBe(false);
    expect(shouldDamagePlayer(attacker, enemy)).toBe(true);
  });
});
