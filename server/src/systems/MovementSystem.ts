import {
  ARENA_BOUNDS,
  MAX_MANA,
  MANA_REGEN_PER_SECOND,
  PLAYER_SPEED,
  type MoveInput
} from '../../../shared/types.js';
import { clamp, directionFromRotation, type ServerPlayer } from './SpellSystem.js';

export function applyMovement(player: ServerPlayer, input: MoveInput, dt: number): void {
  const forward = directionFromRotation(player.rotY);
  const right = {
    x: Math.cos(player.rotY),
    z: -Math.sin(player.rotY)
  };

  let moveX = 0;
  let moveZ = 0;

  if (input.forward) {
    moveX += forward.x;
    moveZ += forward.z;
  }
  if (input.backward) {
    moveX -= forward.x;
    moveZ -= forward.z;
  }
  if (input.right) {
    moveX += right.x;
    moveZ += right.z;
  }
  if (input.left) {
    moveX -= right.x;
    moveZ -= right.z;
  }

  const length = Math.hypot(moveX, moveZ);
  if (length > 0) {
    moveX /= length;
    moveZ /= length;
  }

  player.x = clamp(player.x + moveX * PLAYER_SPEED * dt, ARENA_BOUNDS.minX, ARENA_BOUNDS.maxX);
  player.z = clamp(player.z + moveZ * PLAYER_SPEED * dt, ARENA_BOUNDS.minZ, ARENA_BOUNDS.maxZ);
}

export function regenerateMana(player: ServerPlayer, dt: number): void {
  player.mana = Math.min(MAX_MANA, player.mana + MANA_REGEN_PER_SECOND * dt);
}
