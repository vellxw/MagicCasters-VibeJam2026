export const ROOM_NAME = 'magic_duel';

export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;
export const TICK_DT = 1 / TICK_RATE;

export const PLAYER_RADIUS = 0.45;
export const PLAYER_HEIGHT = 1.7;
export const PLAYER_SPEED = 5.8;
export const MANA_REGEN_PER_SECOND = 6;
export const MAX_HP = 100;
export const MAX_MANA = 100;

export const ARENA_BOUNDS = {
  minX: -8,
  maxX: 8,
  minZ: -6,
  maxZ: 6
} as const;

export const SPAWNS = [
  { x: -5.5, y: 0, z: 0, rotY: -Math.PI / 2 },
  { x: 5.5, y: 0, z: 0, rotY: Math.PI / 2 }
] as const;

export type RoomPhase = 'WAITING' | 'PLAYING' | 'ENDED';

export interface MoveInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  rotY?: number;
  aimX?: number;
  aimZ?: number;
}

export interface PublicPlayerState {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  hp: number;
  mana: number;
  anim: string;
  casting: boolean;
  selectedSpell: string;
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
