import { describe, expect, it } from 'vitest';
import {
  assignTeamId,
  buildRematchStatus,
  findWinningTeam,
  getMatchConfig,
  getSpawnForSlot,
  normalizeArenaId,
  normalizeMatchMode,
  phaseAfterPlayerLeave,
  missingPlayersToStart,
  normalizeCustomBotCount,
  normalizeCustomHumanGate,
  requestedBotsToAdd,
  shouldDamagePlayer,
  shouldScheduleAutoBotFill,
  shouldLockRoom,
  shouldStartMatch
} from './MatchSystem';
import { createTestPlayer, directionFromRotation } from './SpellSystem';

describe('MatchSystem', () => {
  it('sets max clients and required players per mode', () => {
    expect(getMatchConfig('1v1')).toEqual({ mode: '1v1', maxPlayers: 2, requiredPlayers: 2 });
    expect(getMatchConfig('2v2')).toEqual({ mode: '2v2', maxPlayers: 4, requiredPlayers: 4 });
    expect(normalizeMatchMode('unknown')).toBe('1v1');
  });

  it('normalizes optional arena metadata without changing default rooms', () => {
    expect(normalizeArenaId(undefined)).toBe('lightweight');
    expect(normalizeArenaId('')).toBe('lightweight');
    expect(normalizeArenaId('splat-test')).toBe('splat-test');
    expect(normalizeArenaId('other-splat')).toBe('lightweight');
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
    expect(shouldLockRoom('SELECTING', 1, getMatchConfig('2v2'))).toBe(true);
    expect(shouldLockRoom('COUNTDOWN', 1, getMatchConfig('2v2'))).toBe(true);
    expect(shouldLockRoom('PLAYING', 1, getMatchConfig('2v2'))).toBe(true);
  });

  it('computes bot fill needs for waiting rooms', () => {
    expect(missingPlayersToStart(1, getMatchConfig('1v1'))).toBe(1);
    expect(missingPlayersToStart(2, getMatchConfig('1v1'))).toBe(0);
    expect(missingPlayersToStart(1, getMatchConfig('2v2'))).toBe(3);
    expect(missingPlayersToStart(3, getMatchConfig('2v2'))).toBe(1);
    expect(missingPlayersToStart(4, getMatchConfig('2v2'))).toBe(0);
  });

  it('waits for the configured custom human gate before adding requested bots', () => {
    const config = getMatchConfig('2v2');

    expect(normalizeCustomHumanGate(2, config)).toBe(2);
    expect(normalizeCustomHumanGate(3, config)).toBe(3);
    expect(normalizeCustomHumanGate(9, config)).toBe(4);
    expect(normalizeCustomBotCount(3, config)).toBe(3);
    expect(normalizeCustomBotCount(9, config)).toBe(3);

    expect(requestedBotsToAdd('WAITING', 1, 1, config, 2, 3)).toBe(0);
    expect(requestedBotsToAdd('WAITING', 2, 2, config, 2, 3)).toBe(2);
    expect(requestedBotsToAdd('WAITING', 3, 3, config, 3, 2)).toBe(1);
    expect(requestedBotsToAdd('PLAYING', 2, 2, config, 2, 2)).toBe(0);
  });

  it('schedules automatic bot fill only for human players waiting on a non-full room', () => {
    const config = getMatchConfig('2v2');

    expect(shouldScheduleAutoBotFill('WAITING', 1, 1, config)).toBe(true);
    expect(shouldScheduleAutoBotFill('WAITING', 0, 0, config)).toBe(false);
    expect(shouldScheduleAutoBotFill('WAITING', 0, 1, config)).toBe(false);
    expect(shouldScheduleAutoBotFill('WAITING', 4, 4, config)).toBe(false);
    expect(shouldScheduleAutoBotFill('PLAYING', 1, 1, config)).toBe(false);
  });

  it('ends an active match when a player leaves', () => {
    expect(phaseAfterPlayerLeave('PLAYING', 1)).toBe('ENDED');
    expect(phaseAfterPlayerLeave('SELECTING', 1)).toBe('ENDED');
    expect(phaseAfterPlayerLeave('COUNTDOWN', 1)).toBe('ENDED');
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

  it('aims spawn rotations toward the opposing side', () => {
    const leftSpawn = getSpawnForSlot('1v1', 0);
    const rightSpawn = getSpawnForSlot('1v1', 1);

    expect(directionFromRotation(leftSpawn.rotY).x).toBeGreaterThan(0);
    expect(directionFromRotation(rightSpawn.rotY).x).toBeLessThan(0);
  });

  it('finds a 1v1 winner when one player is defeated', () => {
    const teamA = createTestPlayer('team-a', 'A');
    const teamB = createTestPlayer('team-b', 'B');
    teamA.hp = 0;

    expect(findWinningTeam([teamA, teamB])).toBe('B');
  });

  it('keeps a 2v2 match alive while each team still has one living player', () => {
    const players = [
      createTestPlayer('a1', 'A'),
      createTestPlayer('b1', 'B'),
      createTestPlayer('a2', 'A'),
      createTestPlayer('b2', 'B')
    ];
    players[0].hp = 0;

    expect(findWinningTeam(players)).toBeNull();
  });

  it('finds the winning 2v2 team only after the full opposing team is defeated', () => {
    const players = [
      createTestPlayer('a1', 'A'),
      createTestPlayer('b1', 'B'),
      createTestPlayer('a2', 'A'),
      createTestPlayer('b2', 'B')
    ];
    players[0].hp = 0;
    players[2].hp = 0;

    expect(findWinningTeam(players)).toBe('B');

    players[0].hp = 100;
    players[2].hp = 100;
    players[1].hp = 0;
    players[3].hp = 0;

    expect(findWinningTeam(players)).toBe('A');
  });

  it('does not choose a winner when every team is defeated at the same time', () => {
    const players = [
      createTestPlayer('a1', 'A'),
      createTestPlayer('b1', 'B'),
      createTestPlayer('a2', 'A'),
      createTestPlayer('b2', 'B')
    ];
    for (const player of players) {
      player.hp = 0;
    }

    expect(findWinningTeam(players)).toBeNull();
  });

  it('offers rematch only when every required player is still connected and confirmed', () => {
    const config = getMatchConfig('2v2');
    const players = [
      createTestPlayer('a1', 'A'),
      createTestPlayer('b1', 'B'),
      createTestPlayer('a2', 'A'),
      createTestPlayer('b2', 'B')
    ];
    const votes = new Set(['a1', 'b1', 'a2']);

    expect(buildRematchStatus(players, votes, config)).toEqual({
      available: true,
      votes: 3,
      required: 4,
      ready: false
    });

    votes.add('b2');

    expect(buildRematchStatus(players, votes, config)).toEqual({
      available: true,
      votes: 4,
      required: 4,
      ready: true
    });

    expect(buildRematchStatus(players.slice(0, 3), votes, config)).toEqual({
      available: false,
      votes: 0,
      required: 4,
      ready: false
    });
  });
});
