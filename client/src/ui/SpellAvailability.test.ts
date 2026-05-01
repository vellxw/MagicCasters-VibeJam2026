import { describe, expect, it } from 'vitest';
import type { PlayerSnapshot } from '../player/LocalPlayerController';
import { getSpellAvailability, getActiveStatusEffects } from './SpellAvailability';

function player(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id: 'local',
    name: 'Mage',
    x: 0,
    y: 0,
    z: 0,
    rotY: 0,
    hp: 100,
    mana: 100,
    anim: 'idle',
    casting: false,
    selectedSpell: '',
    ...overrides
  };
}

describe('SpellAvailability', () => {
  it('blocks every spell with a clear reason while the player is silenced', () => {
    const availability = getSpellAvailability({
      player: player({ silencedUntil: 2500 }),
      spellId: 'shadow_dart',
      phase: 'PLAYING',
      now: 1000
    });

    expect(availability).toMatchObject({
      canCast: false,
      reason: 'silenced',
      label: 'Silenced',
      remainingMs: 1500
    });
  });

  it('prioritizes cooldown and mana feedback when spells are individually blocked', () => {
    expect(getSpellAvailability({
      player: player({ shadowDartReadyAt: 2200 }),
      spellId: 'shadow_dart',
      phase: 'PLAYING',
      now: 1000
    })).toMatchObject({
      canCast: false,
      reason: 'cooldown',
      label: 'Cooldown 1.2s',
      cooldownProgress: expect.closeTo(0, 5)
    });

    expect(getSpellAvailability({
      player: player({ mana: 4 }),
      spellId: 'abyssal_claw',
      phase: 'PLAYING',
      now: 1000
    })).toMatchObject({
      canCast: false,
      reason: 'no_mana',
      label: 'Need mana'
    });
  });

  it('reports active combat statuses with short labels and timers', () => {
    expect(getActiveStatusEffects(player({
      markedUntil: 2500,
      slowedUntil: 1900,
      rootedUntil: 0,
      shieldActive: true
    }), 1000)).toEqual([
      { id: 'marked', label: 'Marked', remainingMs: 1500 },
      { id: 'slowed', label: 'Slowed', remainingMs: 900 },
      { id: 'shielded', label: 'Shield', remainingMs: 0 }
    ]);
  });
});
