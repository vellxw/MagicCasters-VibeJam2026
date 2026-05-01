import {
  ARENA_BOUNDS,
  MAX_MANA,
  MANA_REGEN_PER_SECOND,
  PLAYER_AIR_DASH_DISTANCE,
  PLAYER_CLIMB_SPEED,
  PLAYER_GRAVITY,
  PLAYER_JUMP_VELOCITY,
  PLAYER_SPEED,
  type ArenaCollisionConfig,
  type MoveInput
} from '../../../shared/types.js';
import type { SparseVoxelCollision } from '../../../shared/voxelCollision.js';
import {
  findClimbableWall,
  findStandingSurfaceY,
  moveWithArenaCollision,
  resolveArenaVerticalCollision
} from '../../../shared/arenaCollision.js';
import { clamp, directionFromRotation, type ServerPlayer } from './SpellSystem.js';

export function applyMovement(
  player: ServerPlayer,
  input: MoveInput,
  dt: number,
  arenaCollision?: ArenaCollisionConfig,
  voxelCollision?: SparseVoxelCollision | null
): void {
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

  const now = Date.now();
  if ((player.rootedUntil ?? 0) > now) {
    moveX = 0;
    moveZ = 0;
    input.dash = false;
  }

  const length = Math.hypot(moveX, moveZ);
  if (length > 0) {
    moveX /= length;
    moveZ /= length;
  }

  let speedMultiplier = 1;
  if ((player.speedBoostUntil ?? 0) > now) speedMultiplier *= 2;
  if ((player.slowedUntil ?? 0) > now) {
    const slowMultiplier = typeof player.slowMultiplier === 'number' && Number.isFinite(player.slowMultiplier)
      ? player.slowMultiplier
      : 0.82;
    speedMultiplier *= Math.min(1, Math.max(0.05, slowMultiplier));
  } else if (player.slowMultiplier !== undefined && player.slowMultiplier !== 1) {
    player.slowMultiplier = 1;
  }

  const bounds = arenaCollision?.bounds ?? ARENA_BOUNDS;
  const floorY = arenaCollision?.floorY ?? 0;
  const walls = arenaCollision?.collisionWalls ?? [];
  const collisionErasers = arenaCollision?.collisionErasers ?? [];
  const groundY = findStandingSurfaceY(player.x, player.z, player.y, floorY, walls, undefined, undefined, {
    voxelCollision: voxelCollision ?? null,
    collisionErasers
  });
  const grounded = Math.abs(player.y - groundY) <= 0.02;
  const dashDistance = consumeAirDash(player, input, grounded, length);
  const resolved = moveWithArenaCollision(
    player.x,
    player.z,
    player.x + moveX * (PLAYER_SPEED * speedMultiplier * dt + dashDistance),
    player.z + moveZ * (PLAYER_SPEED * speedMultiplier * dt + dashDistance),
    bounds,
    walls,
    {
      playerY: player.y,
      floorY,
      voxelCollision,
      collisionErasers
    }
  );
  player.x = clamp(resolved.x, bounds.minX, bounds.maxX);
  player.z = clamp(resolved.z, bounds.minZ, bounds.maxZ);

  applyJumpAndGravity(player, input, dt, arenaCollision, voxelCollision);
}

export function regenerateMana(player: ServerPlayer, dt: number): void {
  player.mana = Math.min(MAX_MANA, player.mana + MANA_REGEN_PER_SECOND * dt);
}

function applyJumpAndGravity(
  player: ServerPlayer,
  input: MoveInput,
  dt: number,
  arenaCollision?: ArenaCollisionConfig,
  voxelCollision?: SparseVoxelCollision | null
): void {
  const floorY = arenaCollision?.floorY ?? 0;
  const walls = arenaCollision?.collisionWalls ?? [];
  const collisionErasers = arenaCollision?.collisionErasers ?? [];
  const climbableWall = findClimbableWall(player.x, player.z, walls);
  if (climbableWall) {
    const maxY = floorY + Math.max(0.1, climbableWall.height);
    const climbDirection = (input.forward || input.jump ? 1 : 0) - (input.backward ? 1 : 0);
    player.y = clamp(player.y + climbDirection * PLAYER_CLIMB_SPEED * dt, floorY, maxY);
    player.velocityY = 0;
    player.airDashAvailable = true;
    return;
  }

  const groundY = findStandingSurfaceY(player.x, player.z, player.y, floorY, walls, undefined, undefined, {
    voxelCollision: voxelCollision ?? null,
    collisionErasers
  });
  const grounded = Math.abs(player.y - groundY) <= 0.02;
  let velocityY = player.velocityY ?? 0;

  if (grounded && input.jump) {
    player.y = groundY;
    velocityY = PLAYER_JUMP_VELOCITY;
    player.airDashAvailable = true;
  } else if (grounded && velocityY <= 0) {
    player.y = groundY;
    velocityY = 0;
    player.airDashAvailable = true;
  }

  if (!grounded || velocityY > 0) {
    const previousY = player.y;
    velocityY -= PLAYER_GRAVITY * dt;
    const vertical = resolveArenaVerticalCollision(
      player.x,
      player.z,
      previousY,
      player.y + velocityY * dt,
      velocityY,
      floorY,
      walls,
      undefined,
      {
        voxelCollision: voxelCollision ?? null,
        collisionErasers
      }
    );
    player.y = vertical.y;
    velocityY = vertical.velocityY;
  }

  const landedGroundY = findStandingSurfaceY(player.x, player.z, player.y, floorY, walls, undefined, undefined, {
    voxelCollision: voxelCollision ?? null,
    collisionErasers
  });
  if (velocityY === 0 && Math.abs(player.y - landedGroundY) <= 0.02) {
    player.airDashAvailable = true;
  }

  player.velocityY = velocityY;
}

function consumeAirDash(player: ServerPlayer, input: MoveInput, grounded: boolean, movementLength: number): number {
  if (grounded) {
    player.airDashAvailable = true;
    return 0;
  }
  if (!input.dash || player.airDashAvailable === false || movementLength <= 0) {
    return 0;
  }

  player.airDashAvailable = false;
  return PLAYER_AIR_DASH_DISTANCE;
}
