import { Schema, type } from '@colyseus/schema';
import { MAX_HP, MAX_MANA, SPAWNS, type TeamId } from '../../../shared/types.js';
import type { SpellId } from '../../../shared/spells.js';
import type { CharacterClass } from '../../../shared/classes.js';
import type { ServerPlayer } from '../systems/SpellSystem.js';

export class PlayerState extends Schema implements ServerPlayer {
  @type('string') id = '';
  @type('string') name = 'Mage';
  @type('string') teamId: TeamId = 'A';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
  @type('number') rotY = 0;
  @type('string') anim = 'idle';
  @type('number') hp = MAX_HP;
  @type('number') mana = MAX_MANA;
  @type('boolean') casting = false;
  @type('string') selectedSpell = '';
  @type('string') characterClass: CharacterClass = 'arcanist';
  @type('number') shadowDartReadyAt = 0;
  @type('number') voidTrapReadyAt = 0;
  @type('number') abyssalClawReadyAt = 0;
  @type('number') eclipseReadyAt = 0;
  @type('number') judgmentRayReadyAt = 0;
  @type('number') penitentSealReadyAt = 0;
  @type('number') glacialSpikesReadyAt = 0;
  @type('number') firmamentShieldReadyAt = 0;
  @type('boolean') shieldActive = false;
  @type('number') silencedUntil = 0;
  @type('number') slowedUntil = 0;
  @type('number') speedBoostUntil = 0;
  @type('number') markedUntil = 0;
  @type('number') rootedUntil = 0;
  @type('boolean') explosiveShield = false;
  cooldowns: Partial<Record<SpellId, number>> = {};
  castingUntil = 0;
  velocityY = 0;

  constructor(
    id?: string,
    name?: string,
    teamId: TeamId = 'A',
    spawnIndex = 0,
    characterClass: CharacterClass = 'arcanist'
  ) {
    super();
    if (!id) return;

    const spawn = SPAWNS[spawnIndex % SPAWNS.length];
    this.id = id;
    this.name = sanitizeName(name);
    this.teamId = teamId;
    this.characterClass = characterClass;
    this.x = spawn.x;
    this.y = spawn.y;
    this.z = spawn.z;
    this.rotY = spawn.rotY;
  }

  resetForDuel(spawnIndex: number): void {
    this.resetForMatch(SPAWNS[spawnIndex % SPAWNS.length], this.teamId);
  }

  resetForMatch(spawn: { x: number; y: number; z: number; rotY: number }, teamId: TeamId): void {
    this.teamId = teamId;
    this.x = spawn.x;
    this.y = spawn.y;
    this.z = spawn.z;
    this.rotY = spawn.rotY;
    this.velocityY = 0;
    this.anim = 'idle';
    this.hp = MAX_HP;
    this.mana = MAX_MANA;
    this.casting = false;
    this.selectedSpell = '';
    this.shieldActive = false;
    this.silencedUntil = 0;
    this.slowedUntil = 0;
    this.speedBoostUntil = 0;
    this.markedUntil = 0;
    this.rootedUntil = 0;
    this.explosiveShield = false;
    this.cooldowns = {};
    this.castingUntil = 0;
    this.syncCooldownFields();
  }

  syncCooldownFields(): void {
    this.shadowDartReadyAt = this.cooldowns.shadow_dart ?? 0;
    this.voidTrapReadyAt = this.cooldowns.void_trap ?? 0;
    this.abyssalClawReadyAt = this.cooldowns.abyssal_claw ?? 0;
    this.eclipseReadyAt = this.cooldowns.eclipse ?? 0;
    this.judgmentRayReadyAt = this.cooldowns.judgment_ray ?? 0;
    this.penitentSealReadyAt = this.cooldowns.penitent_seal ?? 0;
    this.glacialSpikesReadyAt = this.cooldowns.glacial_spikes ?? 0;
    this.firmamentShieldReadyAt = this.cooldowns.firmament_shield ?? 0;
  }
}

function sanitizeName(name?: string): string {
  const clean = (name ?? '').replace(/[^\w \-]/g, '').trim().slice(0, 18);
  return clean || `Mage ${Math.floor(Math.random() * 900 + 100)}`;
}
