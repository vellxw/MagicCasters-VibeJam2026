import {
  DEFAULT_ARENA_ID,
  MATCH_CONFIGS,
  SPLAT_TEST_ARENA_ID,
  TEAM_SPAWNS,
  type ArenaId,
  type MatchConfig,
  type MatchMode,
  type RoomPhase,
  type TeamId
} from '../../../shared/types.js';
import type { ServerPlayer } from './SpellSystem.js';

export function normalizeMatchMode(value: unknown): MatchMode {
  return value === '2v2' ? '2v2' : '1v1';
}

export function normalizeArenaId(value: unknown): ArenaId {
  return value === SPLAT_TEST_ARENA_ID ? SPLAT_TEST_ARENA_ID : DEFAULT_ARENA_ID;
}

export function getMatchConfig(mode: MatchMode): MatchConfig {
  return MATCH_CONFIGS[mode];
}

export function assignTeamId(_mode: MatchMode, slotIndex: number): TeamId {
  return slotIndex % 2 === 0 ? 'A' : 'B';
}

export function getSpawnForSlot(mode: MatchMode, slotIndex: number): { x: number; y: number; z: number; rotY: number } {
  const spawns = TEAM_SPAWNS[mode];
  return spawns[slotIndex % spawns.length];
}

export function shouldStartMatch(playerCount: number, config: MatchConfig): boolean {
  return playerCount >= config.requiredPlayers;
}

export function shouldLockRoom(phase: RoomPhase, playerCount: number, config: MatchConfig): boolean {
  return phase === 'PLAYING' || phase === 'ENDED' || playerCount >= config.maxPlayers;
}

export function phaseAfterPlayerLeave(previousPhase: RoomPhase, remainingPlayers: number): RoomPhase {
  if (previousPhase === 'PLAYING' || previousPhase === 'ENDED' || remainingPlayers <= 0) {
    return 'ENDED';
  }
  return 'WAITING';
}

export function shouldDamagePlayer(attacker: ServerPlayer, target: ServerPlayer): boolean {
  return attacker.id !== target.id && attacker.teamId !== target.teamId && target.hp > 0;
}
