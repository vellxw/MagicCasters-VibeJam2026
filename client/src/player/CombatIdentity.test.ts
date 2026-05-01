import { describe, expect, it } from 'vitest';
import {
  clampHealthRatio,
  resolveCombatRelation,
  styleForCombatRelation
} from './CombatIdentity';

describe('CombatIdentity', () => {
  it('resolves visual relation from local session and team state', () => {
    expect(resolveCombatRelation({
      playerId: 'local',
      playerTeamId: 'A',
      localSessionId: 'local',
      localTeamId: 'A'
    })).toBe('self');

    expect(resolveCombatRelation({
      playerId: 'friend',
      playerTeamId: 'A',
      localSessionId: 'local',
      localTeamId: 'A'
    })).toBe('ally');

    expect(resolveCombatRelation({
      playerId: 'rival',
      playerTeamId: 'B',
      localSessionId: 'local',
      localTeamId: 'A'
    })).toBe('enemy');
  });

  it('falls back predictably when team data is incomplete', () => {
    expect(resolveCombatRelation({
      playerId: 'unknown',
      playerTeamId: undefined,
      localSessionId: 'local',
      localTeamId: 'A'
    })).toBe('neutral');

    expect(resolveCombatRelation({
      playerId: 'remote',
      playerTeamId: 'B',
      localSessionId: null,
      localTeamId: null
    })).toBe('neutral');
  });

  it('clamps health ratios for nameplates and HUD bars', () => {
    expect(clampHealthRatio(100)).toBe(1);
    expect(clampHealthRatio(37)).toBe(0.37);
    expect(clampHealthRatio(-20)).toBe(0);
    expect(clampHealthRatio(160)).toBe(1);
    expect(clampHealthRatio(Number.NaN)).toBe(0);
  });

  it('maps relation to readable labels and colors', () => {
    expect(styleForCombatRelation('ally')).toMatchObject({
      badge: 'ALLY',
      accentHex: '#7dd3fc'
    });
    expect(styleForCombatRelation('enemy')).toMatchObject({
      badge: 'ENEMY',
      accentHex: '#ff6b35'
    });
    expect(styleForCombatRelation('self').showNameplate).toBe(false);
  });
});
