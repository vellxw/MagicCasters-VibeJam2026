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

export function missingPlayersToStart(playerCount: number, config: MatchConfig): number {
  return Math.max(0, config.requiredPlayers - playerCount);
}

export function shouldScheduleAutoBotFill(
  phase: RoomPhase,
  humanPlayerCount: number,
  playerCount: number,
  config: MatchConfig
): boolean {
  return phase === 'WAITING' && humanPlayerCount > 0 && missingPlayersToStart(playerCount, config) > 0;
}

export function shouldLockRoom(phase: RoomPhase, playerCount: number, config: MatchConfig): boolean {
  return phase === 'SELECTING' || phase === 'COUNTDOWN' || phase === 'PLAYING' || phase === 'ENDED' || playerCount >= config.maxPlayers;
}

export function phaseAfterPlayerLeave(previousPhase: RoomPhase, remainingPlayers: number): RoomPhase {
  if (previousPhase !== 'WAITING' || remainingPlayers <= 0) {
    return 'ENDED';
  }
  return 'WAITING';
}

export function findWinningTeam(players: Iterable<Pick<ServerPlayer, 'teamId' | 'hp'>>): TeamId | null {
  const livingTeams = new Set<TeamId>();
  const presentTeams = new Set<TeamId>();

  for (const player of players) {
    presentTeams.add(player.teamId);
    if (player.hp > 0) {
      livingTeams.add(player.teamId);
    }
  }

  if (presentTeams.size < 2 || livingTeams.size !== 1) {
    return null;
  }

  return Array.from(livingTeams)[0] ?? null;
}

export interface RematchStatus {
  available: boolean;
  votes: number;
  required: number;
  ready: boolean;
}

export function buildRematchStatus(
  players: Iterable<Pick<ServerPlayer, 'id'>>,
  votes: ReadonlySet<string>,
  config: MatchConfig
): RematchStatus {
  const playerIds = Array.from(players, (player) => player.id);
  const available = playerIds.length === config.requiredPlayers;
  if (!available) {
    return { available: false, votes: 0, required: config.requiredPlayers, ready: false };
  }

  const voteCount = playerIds.filter((id) => votes.has(id)).length;
  return {
    available: true,
    votes: voteCount,
    required: config.requiredPlayers,
    ready: voteCount >= config.requiredPlayers
  };
}

export function shouldDamagePlayer(attacker: ServerPlayer, target: ServerPlayer): boolean {
  return attacker.hp > 0 && attacker.id !== target.id && attacker.teamId !== target.teamId && target.hp > 0;
}
