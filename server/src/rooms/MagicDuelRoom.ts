import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Client } from '@colyseus/core';
import { Room } from '@colyseus/core';
import { SPELLS, isSpellId, type SpellId } from '../../../shared/spells.js';
import { isCharacterClass, type CharacterClass } from '../../../shared/classes.js';
import {
  DEFAULT_ARENA_ID,
  PLAYER_RADIUS,
  SPLAT_TEST_ARENA_ID,
  TICK_DT,
  TICK_MS,
  type ArenaCollisionConfig,
  type ArenaId,
  type MatchConfig,
  type MatchMode,
  type MoveInput
} from '../../../shared/types.js';
import { circleIntersectsWall, defaultArenaCollisionConfig, normalizeArenaCollisionConfig } from '../../../shared/arenaCollision.js';
import type { SparseVoxelCollision } from '../../../shared/voxelCollision.js';
import { GameState } from '../schema/GameState.js';
import { PlayerState } from '../schema/PlayerState.js';
import { ProjectileState } from '../schema/ProjectileState.js';
import { applyMovement, regenerateMana } from '../systems/MovementSystem.js';
import { selectPublishedSplatArenaForMode } from '../systems/ServerSplatMapPool.js';
import { loadServerVoxelCollisionSync } from '../systems/ServerVoxelCollision.js';
import {
  assignTeamId,
  getMatchConfig,
  getSpawnForSlot,
  normalizeMatchMode,
  phaseAfterPlayerLeave,
  shouldDamagePlayer,
  shouldLockRoom,
  shouldStartMatch
} from '../systems/MatchSystem.js';
import { applyDamage, applyProjectileDamage, directionAwayFrom, executeSpellCast } from '../systems/SpellSystem.js';

interface JoinOptions {
  name?: string;
  mode?: MatchMode;
  characterClass?: CharacterClass;
}

export class MagicDuelRoom extends Room<GameState> {
  maxClients = 2;

  private inputs = new Map<string, MoveInput>();
  private mode: MatchMode = '1v1';
  private arenaId: ArenaId = 'lightweight';
  private arenaPresetId = '';
  private arenaPresetUrl = '';
  private arenaDisplayName = '';
  private config: MatchConfig = getMatchConfig('1v1');
  private arenaCollision: ArenaCollisionConfig = defaultArenaCollisionConfig();
  private voxelCollision: SparseVoxelCollision | null = null;
  private traps = new Map<string, { x: number; z: number; radius: number; ownerId: string; spellId: SpellId; expiresAt: number }>();

  onCreate(options?: JoinOptions): void {
    this.mode = normalizeMatchMode(options?.mode);
    const selectedArena = selectPublishedSplatArenaForMode(this.mode, resolveProjectRoot());
    if (selectedArena) {
      this.arenaId = SPLAT_TEST_ARENA_ID;
      this.arenaPresetId = selectedArena.presetId;
      this.arenaPresetUrl = selectedArena.presetUrl;
      this.arenaDisplayName = selectedArena.displayName;
      this.arenaCollision = normalizeArenaCollisionConfig(selectedArena.collision);
    } else {
      this.arenaId = DEFAULT_ARENA_ID;
      this.arenaPresetId = '';
      this.arenaPresetUrl = '';
      this.arenaDisplayName = '';
      this.arenaCollision = defaultArenaCollisionConfig();
    }
    this.voxelCollision = loadServerVoxelCollisionSync(this.arenaCollision.voxelCollisionUrl, resolveProjectRoot());
    if (this.voxelCollision) {
      console.log(`[server] Loaded voxel collision ${this.arenaCollision.voxelCollisionUrl}`);
    } else if (this.arenaCollision.voxelCollisionUrl) {
      console.warn(`[server] Voxel collision unavailable: ${this.arenaCollision.voxelCollisionUrl}`);
    }
    this.config = getMatchConfig(this.mode);
    this.maxClients = this.config.maxPlayers;
    this.setState(new GameState());
    this.state.mode = this.mode;
    this.state.arenaId = this.arenaId;
    this.state.arenaPresetId = this.arenaPresetId;
    this.state.arenaPresetUrl = this.arenaPresetUrl;
    this.state.arenaDisplayName = this.arenaDisplayName;
    this.state.requiredPlayers = this.config.requiredPlayers;
    this.state.maxPlayers = this.config.maxPlayers;
    this.state.message = this.arenaDisplayName
      ? `${this.mode} queue: ${this.arenaDisplayName}`
      : `${this.mode} queue`;
    this.setSimulationInterval(() => this.tick(), TICK_MS);

    this.onMessage('move', (client, input: MoveInput) => {
      this.inputs.set(client.sessionId, normalizeInput(input));
    });

    this.onMessage('cast', (client, message: { spellId?: string }) => {
      this.handleCast(client, message?.spellId ?? '');
    });
  }

  onJoin(client: Client, options?: JoinOptions): void {
    const slotIndex = this.state.players.size;
    const teamId = assignTeamId(this.mode, slotIndex);
    const characterClass = isCharacterClass(options?.characterClass ?? '')
      ? options!.characterClass
      : 'arcanist';
    const player = new PlayerState(client.sessionId, options?.name, teamId, slotIndex, characterClass);
    this.state.players.set(client.sessionId, player);
    this.inputs.set(client.sessionId, emptyInput());
    this.updatePlayerCount();

    if (shouldStartMatch(this.state.playerCount, this.config)) {
      this.startDuel(`${this.mode} match started`);
    } else {
      this.state.phase = 'WAITING';
      this.state.message = `Finding ${this.mode} match`;
      this.broadcastPhase();
    }

    this.syncLockState();
  }

  onLeave(client: Client): void {
    const previousPhase = this.state.phase;
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.clearProjectiles();
    this.updatePlayerCount();

    const remaining = Array.from(this.state.players.values());
    if (remaining.length > 0) {
      this.state.phase = phaseAfterPlayerLeave(previousPhase, remaining.length);
      this.state.winnerId = '';
      this.state.message = this.state.phase === 'ENDED'
        ? 'A mage left the match. Return to lobby.'
        : 'A mage left. Returning to queue.';
      if (this.state.phase === 'WAITING') {
        this.reassignWaitingPlayers();
      }
      this.broadcastPhase();
      this.syncLockState();
    }
  }

  private startDuel(message: string): void {
    let index = 0;
    for (const player of this.state.players.values()) {
      const teamId = assignTeamId(this.mode, index);
      player.resetForMatch(this.getSpawnForSlot(index), teamId);
      index++;
    }
    this.clearProjectiles();
    this.traps.clear();
    this.updatePlayerCount();
    this.state.phase = 'PLAYING';
    this.state.winnerId = '';
    this.state.message = message;
    this.lock();
    this.broadcastPhase();
  }

  private handleCast(client: Client, rawSpellId: string): void {
    const caster = this.state.players.get(client.sessionId);
    if (!caster) return;

    if (!isSpellId(rawSpellId)) {
      client.send('cast_denied', { spellId: rawSpellId, reason: 'unknown_spell' });
      return;
    }

    const targets = Array.from(this.state.players.values()).filter((player) => shouldDamagePlayer(caster, player));
    const now = Date.now();
    const result = executeSpellCast({
      caster,
      targets,
      spellId: rawSpellId,
      now,
      phase: this.state.phase,
      nextProjectileId: () => `p_${Math.random().toString(36).slice(2, 10)}`,
      arenaCollision: this.arenaCollision,
      voxelCollision: this.voxelCollision
    });

    caster.castingUntil = now + 500;
    caster.syncCooldownFields();

    if (!result.ok) {
      client.send('cast_denied', { spellId: rawSpellId, reason: result.reason });
      return;
    }

    this.broadcast('spell_confirmed', {
      playerId: caster.id,
      spellId: rawSpellId,
      x: caster.x,
      y: caster.y,
      z: caster.z
    });

    if (result.kind === 'projectile') {
      this.state.projectiles.set(
        result.projectile.id,
        new ProjectileState(result.projectile, SPELLS[result.spellId].radius)
      );
    }

    if (result.kind === 'trap') {
      // Remove existing trap from this caster
      for (const [id, trap] of this.traps) {
        if (trap.ownerId === caster.id) {
          this.traps.delete(id);
          break;
        }
      }
      this.traps.set(`trap_${Math.random().toString(36).slice(2, 10)}`, result.trap);
    }

    if (result.kind === 'instant') {
      for (const hit of result.hits) {
        this.broadcast('damage', hit);
      }
      // Apply class-specific instant spell effects
      this.applyClassSpellEffects(caster, rawSpellId as SpellId, result.hits.map((h) => h.targetId));
      this.checkForWinner();
    }

    if (result.kind === 'ground_line') {
      for (const hit of result.hits) {
        this.broadcast('damage', hit);
      }
      this.broadcast('ground_line_hit', {
        casterId: caster.id,
        targetIds: result.hits.map((h) => h.targetId),
        x: caster.x,
        z: caster.z,
        dirX: -Math.sin(caster.rotY),
        dirZ: -Math.cos(caster.rotY)
      });
      this.applyClassSpellEffects(caster, rawSpellId as SpellId, result.hits.map((h) => h.targetId));
      this.checkForWinner();
    }

    // Apply class-specific projectile spell effects
    if (result.kind === 'projectile') {
      this.applyClassSpellEffects(caster, rawSpellId as SpellId, []);
    }
  }

  private applyClassSpellEffects(
    caster: PlayerState,
    spellId: SpellId,
    hitTargetIds: string[]
  ): void {
    const now = Date.now();
    const characterClass = caster.characterClass as CharacterClass;

    // Arcanist effects
    if (characterClass === 'arcanist') {
      if (spellId === 'shadow_dart') {
        for (const targetId of hitTargetIds) {
          const target = this.state.players.get(targetId);
          if (target) target.markedUntil = now + 3000;
        }
      }

      if (spellId === 'abyssal_claw') {
        for (const targetId of hitTargetIds) {
          const target = this.state.players.get(targetId);
          if (target && target.markedUntil > now) {
            target.markedUntil = 0;
            applyDamage(target, 8);
            target.silencedUntil = now + 800;
            this.broadcast('mark_consumed', { targetId: target.id, spellId, x: target.x, z: target.z });
          }
        }
      }

      if (spellId === 'eclipse') {
        for (const target of this.state.players.values()) {
          if (target.id === caster.id || target.hp <= 0) continue;
          const distance = Math.hypot(target.x - caster.x, target.z - caster.z);
          if (distance <= SPELLS.eclipse.range && target.markedUntil > now) {
            target.markedUntil = 0;
            applyDamage(target, 10);
            caster.hp = Math.min(100, caster.hp + 5);
            this.broadcast('mark_consumed', { targetId: target.id, spellId, x: target.x, z: target.z });
          }
        }
      }
    }

    // Divine effects
    if (characterClass === 'divine') {
      if (spellId === 'judgment_ray') {
        for (const targetId of hitTargetIds) {
          const target = this.state.players.get(targetId);
          if (target && (target.silencedUntil > now || target.slowedUntil > now)) {
            applyDamage(target, 7); // extra damage on top of base 14
          }
        }
      }

      if (spellId === 'penitent_seal') {
        for (const targetId of hitTargetIds) {
          const target = this.state.players.get(targetId);
          if (target) {
            target.silencedUntil = now + 1000;
            target.slowedUntil = now + 1500;
          }
        }
      }

      if (spellId === 'glacial_spikes') {
        for (const targetId of hitTargetIds) {
          const target = this.state.players.get(targetId);
          if (target && (target.silencedUntil > now || target.slowedUntil > now)) {
            target.rootedUntil = now + 500;
          }
        }
      }

      if (spellId === 'firmament_shield') {
        const hasDebuffedEnemyNearby = Array.from(this.state.players.values()).some(
          (p) =>
            p.id !== caster.id &&
            p.hp > 0 &&
            Math.hypot(p.x - caster.x, p.z - caster.z) <= 2.5 &&
            (p.silencedUntil > now || p.slowedUntil > now)
        );
        if (hasDebuffedEnemyNearby) {
          caster.explosiveShield = true;
        }
      }
    }
  }

  private tick(): void {
    this.state.tick++;
    const now = Date.now();

    if (this.state.phase === 'ENDED') {
      return;
    }

    if (this.state.phase !== 'PLAYING') return;

    for (const player of this.state.players.values()) {
      const input = this.inputs.get(player.id) ?? emptyInput();
      if (typeof input.rotY === 'number' && Number.isFinite(input.rotY)) {
        player.rotY = input.rotY;
      }
      applyMovement(player, input, TICK_DT, this.arenaCollision, this.voxelCollision);
      regenerateMana(player, TICK_DT);
      player.casting = now < player.castingUntil;
      player.anim = player.casting
        ? 'casting'
        : player.y > this.arenaCollision.floorY + 0.03 || Math.abs(player.velocityY) > 0.01
          ? 'jump'
          : moving(input) ? 'run' : 'idle';
    }

    this.updateProjectiles();
    this.updateTraps();
    this.checkForWinner();
  }

  private updateTraps(): void {
    const now = Date.now();
    for (const [trapId, trap] of this.traps) {
      if (trap.expiresAt <= now) {
        this.traps.delete(trapId);
        continue;
      }
      for (const player of this.state.players.values()) {
        if (player.id === trap.ownerId || player.hp <= 0) continue;
        const dist = Math.hypot(player.x - trap.x, player.z - trap.z);
        if (dist <= trap.radius) {
          applyDamage(player, SPELLS[trap.spellId].damage);
          this.broadcast('damage', { targetId: player.id, amount: SPELLS[trap.spellId].damage, hp: player.hp });
          this.broadcast('trap_triggered', { trapOwnerId: trap.ownerId, targetId: player.id, x: trap.x, z: trap.z });

          const owner = this.state.players.get(trap.ownerId);
          if (owner && owner.characterClass === 'arcanist') {
            player.markedUntil = now + 3000;
          }

          this.traps.delete(trapId);
          break;
        }
      }
    }
  }

  private updateProjectiles(): void {
    const removeIds: string[] = [];

    for (const projectile of this.state.projectiles.values()) {
      projectile.x += projectile.dirX * projectile.speed * TICK_DT;
      projectile.y += projectile.dirY * projectile.speed * TICK_DT;
      projectile.z += projectile.dirZ * projectile.speed * TICK_DT;
      projectile.ttl -= TICK_DT;

      if (
        projectile.ttl <= 0 ||
        projectile.x < this.arenaCollision.bounds.minX - 1 ||
        projectile.x > this.arenaCollision.bounds.maxX + 1 ||
        projectile.z < this.arenaCollision.bounds.minZ - 1 ||
        projectile.z > this.arenaCollision.bounds.maxZ + 1 ||
        this.projectileHitsVoxelCollision(projectile) ||
        this.projectileHitsCollisionWall(projectile)
      ) {
        removeIds.push(projectile.id);
        continue;
      }

      for (const player of this.state.players.values()) {
        const owner = this.state.players.get(projectile.ownerId);
        if (!owner || !shouldDamagePlayer(owner, player)) continue;
        const distance = Math.hypot(projectile.x - player.x, projectile.z - player.z);
        const verticalOk = projectile.y >= player.y && projectile.y <= player.y + 2.2;
        if (verticalOk && distance <= PLAYER_RADIUS + projectile.radius) {
          const hit = applyProjectileDamage(player, projectile.spellId as SpellId);
          removeIds.push(projectile.id);
          this.broadcast('damage', { targetId: player.id, amount: hit.damage, hp: player.hp });
          if (hit.shieldBroken && player.explosiveShield) {
            player.explosiveShield = false;
            this.explodeShield(player);
          }
          break;
        }
      }
    }

    for (const id of removeIds) {
      this.state.projectiles.delete(id);
    }
  }

  private checkForWinner(): void {
    if (this.state.phase !== 'PLAYING') return;
    const defeated = Array.from(this.state.players.values()).find((player) => player.hp <= 0);
    if (!defeated) return;

    const winner = Array.from(this.state.players.values()).find((player) => player.id !== defeated.id);
    this.state.phase = 'ENDED';
    this.state.winnerId = winner?.id ?? '';
    this.state.message = winner ? `Team ${winner.teamId} wins` : 'Duel ended';
    this.clearProjectiles();
    this.traps.clear();
    this.lock();
    this.broadcastPhase();
  }

  private explodeShield(player: PlayerState): void {
    const now = Date.now();
    for (const target of this.state.players.values()) {
      if (target.id === player.id || target.hp <= 0) continue;
      const distance = Math.hypot(target.x - player.x, target.z - player.z);
      if (distance <= 2.5) {
        const dir = directionAwayFrom(player, target);
        target.x = clamp(target.x + dir.x * 2, this.arenaCollision.bounds.minX, this.arenaCollision.bounds.maxX);
        target.z = clamp(target.z + dir.z * 2, this.arenaCollision.bounds.minZ, this.arenaCollision.bounds.maxZ);
        applyDamage(target, 10);
        this.broadcast('damage', { targetId: target.id, amount: 10, hp: target.hp });
      }
    }
    this.broadcast('shield_exploded', { casterId: player.id, x: player.x, z: player.z });
  }

  private clearProjectiles(): void {
    for (const id of Array.from(this.state.projectiles.keys())) {
      this.state.projectiles.delete(id);
    }
  }

  private updatePlayerCount(): void {
    this.state.playerCount = this.state.players.size;
  }

  private reassignWaitingPlayers(): void {
    let index = 0;
    for (const player of this.state.players.values()) {
      player.resetForMatch(this.getSpawnForSlot(index), assignTeamId(this.mode, index));
      index++;
    }
  }

  private getSpawnForSlot(slotIndex: number): { x: number; y: number; z: number; rotY: number } {
    if (this.arenaId === SPLAT_TEST_ARENA_ID) {
      return this.arenaCollision.spawnPoints[slotIndex % this.arenaCollision.spawnPoints.length]
        ?? getSpawnForSlot(this.mode, slotIndex);
    }
    return getSpawnForSlot(this.mode, slotIndex);
  }

  private projectileHitsCollisionWall(projectile: ProjectileState): boolean {
    return this.arenaCollision.collisionWalls.some((wall) => (
      !wall.climbable &&
      projectile.y >= this.arenaCollision.floorY &&
      projectile.y <= this.arenaCollision.floorY + wall.height &&
      circleIntersectsWall(projectile.x, projectile.z, Math.max(projectile.radius, 0.05), wall)
    ));
  }

  private projectileHitsVoxelCollision(projectile: ProjectileState): boolean {
    if (!this.voxelCollision) return false;
    const radius = Math.max(projectile.radius, 0.05);
    const points = [
      [projectile.x, projectile.y, projectile.z],
      [projectile.x + radius, projectile.y, projectile.z],
      [projectile.x - radius, projectile.y, projectile.z],
      [projectile.x, projectile.y, projectile.z + radius],
      [projectile.x, projectile.y, projectile.z - radius]
    ] as const;
    return points.some(([x, y, z]) => this.voxelCollision?.isWorldSolid(x, y, z, {
      floorY: this.arenaCollision.floorY,
      erasers: this.arenaCollision.collisionErasers ?? []
    }) ?? false);
  }

  private syncLockState(): void {
    if (shouldLockRoom(this.state.phase, this.state.playerCount, this.config)) {
      this.lock();
    } else {
      this.unlock();
    }
  }

  private broadcastPhase(): void {
    this.broadcast('phase', {
      phase: this.state.phase,
      message: this.state.message,
      mode: this.state.mode,
      playerCount: this.state.playerCount,
      requiredPlayers: this.state.requiredPlayers,
      maxPlayers: this.state.maxPlayers,
      arenaId: this.state.arenaId,
      arenaPresetId: this.state.arenaPresetId,
      arenaPresetUrl: this.state.arenaPresetUrl,
      arenaDisplayName: this.state.arenaDisplayName,
      winnerId: this.state.winnerId
    });
  }
}

function emptyInput(): MoveInput {
  return { forward: false, backward: false, left: false, right: false, jump: false, dash: false, rotY: 0 };
}

function normalizeInput(input: MoveInput): MoveInput {
  return {
    forward: Boolean(input?.forward),
    backward: Boolean(input?.backward),
    left: Boolean(input?.left),
    right: Boolean(input?.right),
    jump: Boolean(input?.jump),
    dash: Boolean(input?.dash),
    rotY: typeof input?.rotY === 'number' && Number.isFinite(input.rotY) ? input.rotY : 0
  };
}

function moving(input: MoveInput): boolean {
  return input.forward || input.backward || input.left || input.right;
}

function resolveProjectRoot(): string {
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, 'client', 'public', 'arena-presets'))) {
    return cwd;
  }
  if (existsSync(resolve(cwd, '..', 'client', 'public', 'arena-presets'))) {
    return resolve(cwd, '..');
  }
  return cwd;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
