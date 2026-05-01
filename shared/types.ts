import type { CharacterClass } from './classes.js';

export const ROOM_NAME = 'magic_match';
export const GLOBAL_CHAT_ROOM_NAME = 'global_chat';

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const TICK_DT = 1 / TICK_RATE;

export const PLAYER_RADIUS = 0.45;
export const PLAYER_HEIGHT = 1.7;
export const PLAYER_SPEED = 5.2;
export const PLAYER_JUMP_VELOCITY = 6.4;
export const PLAYER_GRAVITY = 18.5;
export const PLAYER_CLIMB_SPEED = 3.2;
export const PLAYER_AIR_DASH_DISTANCE = 2.4;
export const PLAYER_OBSTACLE_CLEARANCE = 0.04;
export const PLAYER_SURFACE_SNAP_TOLERANCE = 0.08;
export const MANA_REGEN_PER_SECOND = 6;
export const MAX_HP = 100;
export const MAX_MANA = 100;

export const ARENA_BOUNDS = {
  minX: -8,
  maxX: 8,
  minZ: -6,
  maxZ: 6
} as const;

export interface ArenaBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ArenaSpawnPoint {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export interface ArenaCollisionWall {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotY: number;
  climbable?: boolean;
  ramp?: boolean;
}

export interface ArenaCollisionConfig {
  bounds: ArenaBounds;
  floorY: number;
  spawnPoints: ArenaSpawnPoint[];
  voxelCollisionUrl?: string | null;
  collisionErasers?: ArenaCollisionWall[];
  collisionWalls: ArenaCollisionWall[];
}

export type MatchMode = '1v1' | '2v2';
export type ArenaId = 'lightweight' | 'splat-test';
export type TeamId = 'A' | 'B';
export type BotSkill = 'novice' | 'adept' | 'master';

export const DEFAULT_ARENA_ID: ArenaId = 'lightweight';
export const SPLAT_TEST_ARENA_ID: ArenaId = 'splat-test';
export const BOT_SKILLS = ['novice', 'adept', 'master'] as const satisfies readonly BotSkill[];
export const DEFAULT_AUTO_BOT_SKILL: BotSkill = 'adept';
export const AUTO_BOT_FILL_MS = 60000;

export function arenaIdForMatchMode(_mode: MatchMode): ArenaId {
  return DEFAULT_ARENA_ID;
}

export interface MatchConfig {
  mode: MatchMode;
  maxPlayers: number;
  requiredPlayers: number;
}

export const MATCH_CONFIGS: Record<MatchMode, MatchConfig> = {
  '1v1': { mode: '1v1', maxPlayers: 2, requiredPlayers: 2 },
  '2v2': { mode: '2v2', maxPlayers: 4, requiredPlayers: 4 }
};

export const SPAWNS = [
  { x: -5.5, y: 0, z: 0, rotY: -Math.PI / 2 },
  { x: 5.5, y: 0, z: 0, rotY: Math.PI / 2 }
] as const;

export const TEAM_SPAWNS: Record<MatchMode, Array<{ x: number; y: number; z: number; rotY: number }>> = {
  '1v1': [
    { x: -5.5, y: 0, z: 0, rotY: -Math.PI / 2 },
    { x: 5.5, y: 0, z: 0, rotY: Math.PI / 2 }
  ],
  '2v2': [
    { x: -5.8, y: 0, z: -1.25, rotY: -Math.PI / 2 },
    { x: 5.8, y: 0, z: 1.25, rotY: Math.PI / 2 },
    { x: -5.8, y: 0, z: 1.25, rotY: -Math.PI / 2 },
    { x: 5.8, y: 0, z: -1.25, rotY: Math.PI / 2 }
  ]
};

export type RoomPhase = 'WAITING' | 'SELECTING' | 'COUNTDOWN' | 'PLAYING' | 'ENDED';

export interface MoveInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump?: boolean;
  dash?: boolean;
  rotY?: number;
  aimX?: number;
  aimZ?: number;
}

export interface PublicPlayerState {
  id: string;
  name: string;
  teamId: TeamId;
  x: number;
  y: number;
  z: number;
  rotY: number;
  hp: number;
  mana: number;
  anim: string;
  casting: boolean;
  selectedSpell: string;
  characterClass: CharacterClass;
  isBot?: boolean;
  botSkill?: string;
  shieldActive?: boolean;
  shieldExpiresAt?: number;
  silencedUntil?: number;
  slowedUntil?: number;
  slowMultiplier?: number;
  speedBoostUntil?: number;
  markedUntil?: number;
  rootedUntil?: number;
  shadowDartReadyAt?: number;
  voidTrapReadyAt?: number;
  abyssalClawReadyAt?: number;
  eclipseReadyAt?: number;
  judgmentRayReadyAt?: number;
  penitentSealReadyAt?: number;
  glacialSpikesReadyAt?: number;
  firmamentShieldReadyAt?: number;
}

export interface PublicProjectileState {
  id: string;
  ownerId: string;
  spellId: string;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  speed: number;
  ttl: number;
}

export type PotionType = 'health' | 'mana';
export type PotionLifecycleState = 'falling' | 'grounded';

export interface PublicPotionState {
  id: string;
  type: PotionType;
  x: number;
  y: number;
  z: number;
  state: PotionLifecycleState;
  spawnedAt: number;
  landedAt: number;
  expiresAt: number;
}
