export const SPELL_IDS = ['fireball', 'ice_bolt', 'light_burst', 'shadow_dash'] as const;

export type SpellId = (typeof SPELL_IDS)[number];

export interface SpellDefinition {
  id: SpellId;
  label: string;
  incantation: string;
  key: string;
  manaCost: number;
  cooldownMs: number;
  kind: 'projectile' | 'instant' | 'dash';
  damage: number;
  range: number;
  radius: number;
  speed: number;
  ttl: number;
  color: number;
}

export const SPELLS: Record<SpellId, SpellDefinition> = {
  fireball: {
    id: 'fireball',
    label: 'Fireball',
    incantation: 'ignis',
    key: '1',
    manaCost: 18,
    cooldownMs: 800,
    kind: 'projectile',
    damage: 18,
    range: 14,
    radius: 0.38,
    speed: 13,
    ttl: 1.6,
    color: 0xff6b35
  },
  ice_bolt: {
    id: 'ice_bolt',
    label: 'Ice Bolt',
    incantation: 'gelu',
    key: '2',
    manaCost: 16,
    cooldownMs: 1100,
    kind: 'projectile',
    damage: 12,
    range: 12,
    radius: 0.32,
    speed: 10,
    ttl: 1.8,
    color: 0x7dd3fc
  },
  light_burst: {
    id: 'light_burst',
    label: 'Light Burst',
    incantation: 'lux',
    key: '3',
    manaCost: 26,
    cooldownMs: 3600,
    kind: 'instant',
    damage: 16,
    range: 4,
    radius: 4,
    speed: 0,
    ttl: 0.45,
    color: 0xfef08a
  },
  shadow_dash: {
    id: 'shadow_dash',
    label: 'Shadow Dash',
    incantation: 'umbra',
    key: '4',
    manaCost: 14,
    cooldownMs: 1600,
    kind: 'dash',
    damage: 0,
    range: 3.2,
    radius: 0,
    speed: 0,
    ttl: 0,
    color: 0xa78bfa
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
    fireball: {
      id: 'fireball',
      label: 'Fuego Abisal',
      incantation: 'abyssus',
      description:
        'Proyectil arcano de fuego violeta oscuro. Rapido, letal y perfecto para presionar.',
      color: 0x7c3aed
    },
    ice_bolt: {
      id: 'ice_bolt',
      label: 'Espectro Falso',
      incantation: 'umbra',
      description:
        'Aumenta tu velocidad y dejas una silueta residual que confunde al enemigo.',
      color: 0x4c1d95
    },
    light_burst: {
      id: 'light_burst',
      label: 'Estallido Umbrio',
      incantation: 'nox',
      description:
        'Explosion circular de energia oscura que empuja a los enemigos cercanos.',
      color: 0x1e1b4b
    },
    shadow_dash: {
      id: 'shadow_dash',
      label: 'Paso Sombrio',
      incantation: 'umbra',
      description: 'Impulso breve en el aire para reposicionarte entre sombras.',
      color: 0xa78bfa
    }
  },
  divine: {
    fireball: {
      id: 'fireball',
      label: 'Rayo Divino',
      incantation: 'fulgur',
      description:
        'Rayo electrico sagrado que viaja veloz hacia el enemigo. Preciso y devastador.',
      color: 0xf59e0b
    },
    ice_bolt: {
      id: 'ice_bolt',
      label: 'Barrera de Luz',
      incantation: 'scutum',
      description:
        'Escudo celestial que absorbe completamente el proximo ataque recibido.',
      color: 0x60a5fa
    },
    light_burst: {
      id: 'light_burst',
      label: 'Sello del Juicio',
      incantation: 'judicium',
      description:
        'Sello divino que ralentiza y silencia al enemigo impactado. Ideal para cortar combos.',
      color: 0xfef08a
    },
    shadow_dash: {
      id: 'shadow_dash',
      label: 'Impulso Celestial',
      incantation: 'caelum',
      description: 'Desplazamiento aereo corto envuelto en luz defensiva.',
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
