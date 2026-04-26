import type { Client } from '@colyseus/core';
import { Room } from '@colyseus/core';
import { SPELLS, isSpellId, type SpellId } from '../../../shared/spells.js';
import {
  ARENA_BOUNDS,
  PLAYER_RADIUS,
  TICK_DT,
  TICK_MS,
  type MatchConfig,
  type MatchMode,
  type MoveInput
} from '../../../shared/types.js';
import { GameState } from '../schema/GameState.js';
import { PlayerState } from '../schema/PlayerState.js';
import { ProjectileState } from '../schema/ProjectileState.js';
import { applyMovement, regenerateMana } from '../systems/MovementSystem.js';
import {
  assignTeamId,
  getMatchConfig,
  getSpawnForSlot,
  normalizeMatchMode,
  shouldDamagePlayer,
  shouldLockRoom,
  shouldStartMatch
} from '../systems/MatchSystem.js';
import { applyProjectileDamage, executeSpellCast } from '../systems/SpellSystem.js';

interface JoinOptions {
  name?: string;
  mode?: MatchMode;
}

export class MagicDuelRoom extends Room<GameState> {
  maxClients = 2;

  private inputs = new Map<string, MoveInput>();
  private mode: MatchMode = '1v1';
  private config: MatchConfig = getMatchConfig('1v1');

  onCreate(options?: JoinOptions): void {
    this.mode = normalizeMatchMode(options?.mode);
    this.config = getMatchConfig(this.mode);
    this.maxClients = this.config.maxPlayers;
    this.setState(new GameState());
    this.state.mode = this.mode;
    this.state.requiredPlayers = this.config.requiredPlayers;
    this.state.maxPlayers = this.config.maxPlayers;
    this.state.message = `${this.mode} queue`;
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
    const player = new PlayerState(client.sessionId, options?.name, teamId, slotIndex);
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
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.clearProjectiles();
    this.updatePlayerCount();

    const remaining = Array.from(this.state.players.values());
    if (remaining.length > 0) {
      this.state.phase = 'WAITING';
      this.state.winnerId = '';
      this.state.message = 'A mage left. Returning to queue.';
      this.reassignWaitingPlayers();
      this.broadcastPhase();
      this.unlock();
    }
  }

  private startDuel(message: string): void {
    let index = 0;
    for (const player of this.state.players.values()) {
      const teamId = assignTeamId(this.mode, index);
      player.resetForMatch(getSpawnForSlot(this.mode, index), teamId);
      index++;
    }
    this.clearProjectiles();
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
      nextProjectileId: () => `p_${Math.random().toString(36).slice(2, 10)}`
    });

    caster.castingUntil = now + 250;
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

    if (result.kind === 'instant') {
      for (const hit of result.hits) {
        this.broadcast('damage', hit);
      }
      this.checkForWinner();
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
      applyMovement(player, input, TICK_DT);
      regenerateMana(player, TICK_DT);
      player.casting = now < player.castingUntil;
      player.anim = moving(input) ? 'run' : 'idle';
    }

    this.updateProjectiles();
    this.checkForWinner();
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
        projectile.x < ARENA_BOUNDS.minX - 1 ||
        projectile.x > ARENA_BOUNDS.maxX + 1 ||
        projectile.z < ARENA_BOUNDS.minZ - 1 ||
        projectile.z > ARENA_BOUNDS.maxZ + 1
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
    this.lock();
    this.broadcastPhase();
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
      player.resetForMatch(getSpawnForSlot(this.mode, index), assignTeamId(this.mode, index));
      index++;
    }
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
      winnerId: this.state.winnerId
    });
  }
}

function emptyInput(): MoveInput {
  return { forward: false, backward: false, left: false, right: false, rotY: 0 };
}

function normalizeInput(input: MoveInput): MoveInput {
  return {
    forward: Boolean(input?.forward),
    backward: Boolean(input?.backward),
    left: Boolean(input?.left),
    right: Boolean(input?.right),
    rotY: typeof input?.rotY === 'number' && Number.isFinite(input.rotY) ? input.rotY : 0
  };
}

function moving(input: MoveInput): boolean {
  return input.forward || input.backward || input.left || input.right;
}
