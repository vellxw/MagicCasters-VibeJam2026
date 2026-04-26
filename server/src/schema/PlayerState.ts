import { Schema, type } from '@colyseus/schema';
import { MAX_HP, MAX_MANA, SPAWNS } from '../../../shared/types.js';
import type { SpellId } from '../../../shared/spells.js';
import type { ServerPlayer } from '../systems/SpellSystem.js';

export class PlayerState extends Schema implements ServerPlayer {
  @type('string') id = '';
  @type('string') name = 'Mage';
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
  @type('number') rotY = 0;
  @type('string') anim = 'idle';
  @type('number') hp = MAX_HP;
  @type('number') mana = MAX_MANA;
  @type('boolean') casting = false;
  @type('string') selectedSpell = '';
  @type('number') fireballReadyAt = 0;
  @type('number') iceBoltReadyAt = 0;
  @type('number') lightBurstReadyAt = 0;
  @type('number') shadowDashReadyAt = 0;

  cooldowns: Partial<Record<SpellId, number>> = {};
  castingUntil = 0;

  constructor(id?: string, name?: string, spawnIndex = 0) {
    super();
    if (!id) return;

    const spawn = SPAWNS[spawnIndex % SPAWNS.length];
    this.id = id;
    this.name = sanitizeName(name);
    this.x = spawn.x;
    this.y = spawn.y;
    this.z = spawn.z;
    this.rotY = spawn.rotY;
  }

  resetForDuel(spawnIndex: number): void {
    const spawn = SPAWNS[spawnIndex % SPAWNS.length];
    this.x = spawn.x;
    this.y = spawn.y;
    this.z = spawn.z;
    this.rotY = spawn.rotY;
    this.anim = 'idle';
    this.hp = MAX_HP;
    this.mana = MAX_MANA;
    this.casting = false;
    this.selectedSpell = '';
    this.cooldowns = {};
    this.castingUntil = 0;
    this.syncCooldownFields();
  }

  syncCooldownFields(): void {
    this.fireballReadyAt = this.cooldowns.fireball ?? 0;
    this.iceBoltReadyAt = this.cooldowns.ice_bolt ?? 0;
    this.lightBurstReadyAt = this.cooldowns.light_burst ?? 0;
    this.shadowDashReadyAt = this.cooldowns.shadow_dash ?? 0;
  }
}

function sanitizeName(name?: string): string {
  const clean = (name ?? '').replace(/[^\w \-]/g, '').trim().slice(0, 18);
  return clean || `Mage ${Math.floor(Math.random() * 900 + 100)}`;
}
