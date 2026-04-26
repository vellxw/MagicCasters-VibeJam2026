import { MapSchema, Schema, type } from '@colyseus/schema';
import type { RoomPhase } from '../../../shared/types.js';
import { PlayerState } from './PlayerState.js';
import { ProjectileState } from './ProjectileState.js';

export class GameState extends Schema {
  @type('string') mode = '1v1';
  @type('number') requiredPlayers = 2;
  @type('number') maxPlayers = 2;
  @type('number') playerCount = 0;
  @type('string') phase: RoomPhase = 'WAITING';
  @type('number') tick = 0;
  @type('string') message = 'Waiting for rival';
  @type('string') winnerId = '';
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: ProjectileState }) projectiles = new MapSchema<ProjectileState>();
}
