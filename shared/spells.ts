export const SPELL_IDS = [
  'shadow_dart',
  'void_trap',
  'abyssal_claw',
  'eclipse',
  'judgment_ray',
  'penitent_seal',
  'glacial_spikes',
  'firmament_shield'
] as const;

export type SpellId = (typeof SPELL_IDS)[number];

export interface SpellDefinition {
  id: SpellId;
  label: string;
  incantation: string;
  key: string;
  manaCost: number;
  cooldownMs: number;
  kind: 'projectile' | 'instant' | 'dash' | 'trap' | 'ground_line';
  damage: number;
  range: number;
  radius: number;
  speed: number;
  ttl: number;
  color: number;
}

export const SPELLS: Record<SpellId, SpellDefinition> = {
  shadow_dart: {
    id: 'shadow_dart',
    label: 'Shadow Dart',
    incantation: 'nox',
    key: '1',
    manaCost: 12,
    cooldownMs: 700,
    kind: 'projectile',
    damage: 10,
    range: 14,
    radius: 0.32,
    speed: 14,
    ttl: 1.6,
    color: 0x8b5cf6
  },
  void_trap: {
    id: 'void_trap',
    label: 'Void Trap',
    incantation: 'umbra',
    key: '2',
    manaCost: 16,
    cooldownMs: 5000,
    kind: 'trap',
    damage: 12,
    range: 0,
    radius: 1.5,
    speed: 0,
    ttl: 4,
    color: 0x4c1d95
  },
  abyssal_claw: {
    id: 'abyssal_claw',
    label: 'Abyssal Claws',
    incantation: 'abyssus',
    key: '3',
    manaCost: 20,
    cooldownMs: 1200,
    kind: 'projectile',
    damage: 14,
    range: 13,
    radius: 0.38,
    speed: 11,
    ttl: 1.8,
    color: 0x7c3aed
  },
  eclipse: {
    id: 'eclipse',
    label: 'Eclipse',
    incantation: 'exanima',
    key: '4',
    manaCost: 28,
    cooldownMs: 4500,
    kind: 'instant',
    damage: 10,
    range: 4,
    radius: 4,
    speed: 0,
    ttl: 0.45,
    color: 0x1e1b4b
  },
  judgment_ray: {
    id: 'judgment_ray',
    label: 'Judgment Ray',
    incantation: 'fulgur',
    key: '1',
    manaCost: 14,
    cooldownMs: 900,
    kind: 'projectile',
    damage: 14,
    range: 14,
    radius: 0.34,
    speed: 13,
    ttl: 1.5,
    color: 0xf59e0b
  },
  penitent_seal: {
    id: 'penitent_seal',
    label: 'Penitent Seal',
    incantation: 'judicium',
    key: '2',
    manaCost: 22,
    cooldownMs: 3600,
    kind: 'instant',
    damage: 6,
    range: 4,
    radius: 4,
    speed: 0,
    ttl: 0.4,
    color: 0xfef08a
  },
  glacial_spikes: {
    id: 'glacial_spikes',
    label: 'Glacial Spikes',
    incantation: 'glacius',
    key: '3',
    manaCost: 24,
    cooldownMs: 3000,
    kind: 'ground_line',
    damage: 18,
    range: 7,
    radius: 0.6,
    speed: 0,
    ttl: 0.3,
    color: 0x7dd3fc
  },
  firmament_shield: {
    id: 'firmament_shield',
    label: 'Firmament Shield',
    incantation: 'scutum',
    key: '4',
    manaCost: 18,
    cooldownMs: 5000,
    kind: 'instant',
    damage: 0,
    range: 2.5,
    radius: 2.5,
    speed: 0,
    ttl: 0,
    color: 0x93c5fd
  }
};

export interface ClassSpellVariant {
  id: SpellId;
  label: string;
  incantation: string;
  description: string;
  color: number;
}

import type { CharacterClass } from './classes.js';

export const CLASS_SPELL_VARIANTS: Record<
  CharacterClass,
  Record<SpellId, ClassSpellVariant>
> = {
  arcanist: {
    shadow_dart: {
      id: 'shadow_dart',
      label: 'Shadow Dart',
      incantation: 'nox',
      description:
        'A fast shadow projectile that marks the enemy. The Umbral Mark sets up devastating combos.',
      color: 0x8b5cf6
    },
    void_trap: {
      id: 'void_trap',
      label: 'Void Trap',
      incantation: 'umbra',
      description:
        'Places an invisible trap on the ground. When triggered, it damages and marks the enemy with an Umbral Mark.',
      color: 0x4c1d95
    },
    abyssal_claw: {
      id: 'abyssal_claw',
      label: 'Abyssal Claws',
      incantation: 'abyssus',
      description:
        'A dark projectile that consumes an Umbral Mark to deal bonus damage and silence the enemy.',
      color: 0x7c3aed
    },
    eclipse: {
      id: 'eclipse',
      label: 'Eclipse',
      incantation: 'exanima',
      description:
        'A nova of dark energy. For each marked enemy in the area, consumes the mark to deal massive damage and heal you.',
      color: 0x1e1b4b
    },
    judgment_ray: {
      id: 'judgment_ray',
      label: 'Judgment Ray',
      incantation: 'fulgur',
      description: 'A sacred ray that hits weakened enemies harder.',
      color: 0xf59e0b
    },
    penitent_seal: {
      id: 'penitent_seal',
      label: 'Penitent Seal',
      incantation: 'judicium',
      description: 'A control seal that silences and slows nearby enemies.',
      color: 0xfef08a
    },
    glacial_spikes: {
      id: 'glacial_spikes',
      label: 'Glacial Spikes',
      incantation: 'glacius',
      description: 'Ice spikes erupt from the ground. They freeze enemies that are already weakened.',
      color: 0x7dd3fc
    },
    firmament_shield: {
      id: 'firmament_shield',
      label: 'Firmament Shield',
      incantation: 'scutum',
      description: 'A defensive shield that can become explosive near weakened enemies.',
      color: 0x93c5fd
    }
  },
  divine: {
    shadow_dart: {
      id: 'shadow_dart',
      label: 'Shadow Dart',
      incantation: 'nox',
      description: 'A fast shadow projectile that marks the enemy.',
      color: 0x8b5cf6
    },
    void_trap: {
      id: 'void_trap',
      label: 'Void Trap',
      incantation: 'umbra',
      description: 'Places an invisible trap that damages and marks the enemy.',
      color: 0x4c1d95
    },
    abyssal_claw: {
      id: 'abyssal_claw',
      label: 'Abyssal Claws',
      incantation: 'abyssus',
      description: 'A dark projectile that consumes marks to silence enemies.',
      color: 0x7c3aed
    },
    eclipse: {
      id: 'eclipse',
      label: 'Eclipse',
      incantation: 'exanima',
      description: 'A dark nova that consumes marks to heal.',
      color: 0x1e1b4b
    },
    judgment_ray: {
      id: 'judgment_ray',
      label: 'Judgment Ray',
      incantation: 'fulgur',
      description:
        'A sacred lightning ray that travels quickly. Deals devastating damage to silenced or slowed enemies.',
      color: 0xf59e0b
    },
    penitent_seal: {
      id: 'penitent_seal',
      label: 'Penitent Seal',
      incantation: 'judicium',
      description:
        'A circular burst of divine light that silences and slows nearby enemies.',
      color: 0xfef08a
    },
    glacial_spikes: {
      id: 'glacial_spikes',
      label: 'Glacial Spikes',
      incantation: 'glacius',
      description:
        'Ice spikes erupt from the ground in a straight line. If the enemy is silenced or slowed, they freeze in place.',
      color: 0x7dd3fc
    },
    firmament_shield: {
      id: 'firmament_shield',
      label: 'Firmament Shield',
      incantation: 'scutum',
      description:
        'A celestial shield that absorbs the next hit. If a weakened enemy is nearby, the shield explodes when it breaks and knocks them back.',
      color: 0x93c5fd
    }
  }
};

export function getClassSpellVariant(
  spellId: SpellId,
  characterClass: CharacterClass
): ClassSpellVariant {
  return CLASS_SPELL_VARIANTS[characterClass][spellId];
}

export function isSpellId(value: string): value is SpellId {
  return (SPELL_IDS as readonly string[]).includes(value);
}

export function spellIdFromKey(key: string): SpellId | null {
  const found = SPELL_IDS.find((id) => SPELLS[id].key === key);
  return found ?? null;
}

export function spellIdFromIncantation(text: string): SpellId | null {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  const words = normalized.split(' ');

  for (const id of SPELL_IDS) {
    const incantation = SPELLS[id].incantation;
    if (words.includes(incantation) || normalized.includes(incantation)) {
      return id;
    }
  }

  return null;
}
