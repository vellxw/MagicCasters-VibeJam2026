import { describe, expect, it } from 'vitest';
import { ARENA_BOUNDS, MAX_MANA, PLAYER_AIR_DASH_DISTANCE, PLAYER_SPEED } from '../../../shared/types';
import { createTestPlayer } from './SpellSystem';
import { applyMovement, regenerateMana } from './MovementSystem';

describe('MovementSystem', () => {
  it('moves relative to aim, normalizes diagonals, and clamps to arena bounds', () => {
    const player = createTestPlayer('runner');
    player.rotY = 0;

    applyMovement(player, { forward: true, backward: false, left: false, right: false }, 1);
    expect(player.x).toBe(0);
    expect(player.z).toBe(-PLAYER_SPEED);

    player.x = 0;
    player.z = 0;
    applyMovement(player, { forward: true, backward: false, left: false, right: true }, 1);
    expect(Math.hypot(player.x, player.z)).toBeCloseTo(PLAYER_SPEED, 5);

    player.x = ARENA_BOUNDS.maxX - 0.1;
    player.z = ARENA_BOUNDS.maxZ - 0.1;
    player.rotY = Math.PI;
    applyMovement(player, { forward: true, backward: false, left: true, right: false }, 1);
    expect(player.x).toBeLessThanOrEqual(ARENA_BOUNDS.maxX);
    expect(player.z).toBeLessThanOrEqual(ARENA_BOUNDS.maxZ);
  });

  it('regenerates mana without exceeding the server cap', () => {
    const player = createTestPlayer('channeler');
    player.mana = MAX_MANA - 1;

    regenerateMana(player, 1);

    expect(player.mana).toBe(MAX_MANA);
  });

  it('keeps players outside invisible collision walls', () => {
    const player = createTestPlayer('blocked');
    player.x = 0;
    player.z = 1.2;
    player.rotY = 0;

    applyMovement(player, { forward: true, backward: false, left: false, right: false }, 0.2, {
      bounds: { ...ARENA_BOUNDS },
      floorY: 0,
      spawnPoints: [],
      collisionWalls: [
        { id: 'center-wall', x: 0, z: 0, width: 4, depth: 0.5, height: 2, rotY: 0 }
      ]
    });

    expect(player.z).toBeGreaterThanOrEqual(0.69);
  });

  it('lets airborne players clear low obstacle walls', () => {
    const player = createTestPlayer('hurdler');
    player.x = 0;
    player.y = 0.72;
    player.z = 1.2;
    player.velocityY = 0;
    player.rotY = 0;

    applyMovement(player, { forward: true, backward: false, left: false, right: false }, 0.2, {
      bounds: { ...ARENA_BOUNDS },
      floorY: 0,
      spawnPoints: [],
      collisionWalls: [
        { id: 'low-box', x: 0, z: 0, width: 4, depth: 0.5, height: 0.45, rotY: 0 }
      ]
    });

    expect(player.z).toBeLessThan(0.2);
  });

  it('lands players on top of low obstacle walls', () => {
    const player = createTestPlayer('box-lander');
    player.x = 0;
    player.y = 0.8;
    player.z = 0;
    player.velocityY = -2;

    applyMovement(player, { forward: false, backward: false, left: false, right: false }, 0.1, {
      bounds: { ...ARENA_BOUNDS },
      floorY: 0,
      spawnPoints: [],
      collisionWalls: [
        { id: 'landing-box', x: 0, z: 0, width: 2, depth: 2, height: 0.5, rotY: 0 }
      ]
    });

    expect(player.y).toBe(0.5);
    expect(player.velocityY).toBe(0);
  });

  it('lets climbable wall triggers raise the player without blocking horizontal movement', () => {
    const player = createTestPlayer('climber');
    player.x = 0;
    player.z = 0;
    player.rotY = 0;

    applyMovement(player, { forward: true, backward: false, left: false, right: false }, 0.05, {
      bounds: { ...ARENA_BOUNDS },
      floorY: 0,
      spawnPoints: [],
      collisionWalls: [
        { id: 'ladder', x: 0, z: 0, width: 1.2, depth: 0.6, height: 3, rotY: 0, climbable: true }
      ]
    });

    expect(player.y).toBeGreaterThan(0);
    expect(player.y).toBeLessThanOrEqual(3);
    expect(player.z).toBeLessThan(0);
    expect(player.velocityY).toBe(0);
  });

  it('applies a jump impulse and lands back on the floor', () => {
    const player = createTestPlayer('jumper');

    applyMovement(player, { forward: false, backward: false, left: false, right: false, jump: true }, 0.05);

    expect(player.y).toBeGreaterThan(0);
    expect(player.velocityY).toBeGreaterThan(0);

    for (let index = 0; index < 40; index++) {
      applyMovement(player, { forward: false, backward: false, left: false, right: false, jump: false }, 0.05);
    }

    expect(player.y).toBe(0);
    expect(player.velocityY).toBe(0);
  });

  it('air dashes once in the current movement direction while airborne', () => {
    const player = createTestPlayer('air-dasher');
    player.y = 1;
    player.velocityY = 0;
    player.rotY = 0;

    applyMovement(
      player,
      { forward: true, backward: false, left: false, right: false, dash: true },
      0.05
    );

    expect(player.z).toBeCloseTo(-(PLAYER_SPEED * 0.05 + PLAYER_AIR_DASH_DISTANCE), 5);
    expect(player.airDashAvailable).toBe(false);
  });

  it('keeps air dash outside arena collision walls', () => {
    const player = createTestPlayer('blocked-air-dasher');
    player.x = 0;
    player.y = 1;
    player.z = 1.2;
    player.velocityY = 0;
    player.rotY = 0;

    applyMovement(
      player,
      { forward: true, backward: false, left: false, right: false, dash: true },
      0.05,
      {
        bounds: { ...ARENA_BOUNDS },
        floorY: 0,
        spawnPoints: [],
        collisionWalls: [
          { id: 'dash-wall', x: 0, z: 0, width: 4, depth: 0.5, height: 2, rotY: 0 }
        ]
      }
    );

    expect(player.z).toBeGreaterThanOrEqual(0.69);
  });

  it('refreshes the air dash only after the player lands again', () => {
    const player = createTestPlayer('single-air-dash');
    player.y = 1;
    player.velocityY = 0;
    player.rotY = 0;
    const dt = 0.05;

    applyMovement(
      player,
      { forward: true, backward: false, left: false, right: false, dash: true },
      dt
    );
    const afterFirstDash = player.z;

    applyMovement(
      player,
      { forward: true, backward: false, left: false, right: false, dash: true },
      dt
    );

    expect(player.z).toBeCloseTo(afterFirstDash - PLAYER_SPEED * dt, 5);
    expect(player.airDashAvailable).toBe(false);

    for (let index = 0; index < 30; index++) {
      applyMovement(player, { forward: false, backward: false, left: false, right: false, jump: false }, dt);
    }

    expect(player.y).toBe(0);
    expect(player.airDashAvailable).toBe(true);
  });
});
