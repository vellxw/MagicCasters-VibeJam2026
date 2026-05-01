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
  kind: 'projectile' | 'instant' | 'dash' | 'trap' | 'ground_line' | 'delayed_area';
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
    label: 'Dardo Sombrio',
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
    label: 'Trampa del Vacio',
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
    label: 'Garras Abisales',
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
    label: 'Rayo del Juicio',
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
    label: 'Sello Penitente',
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
    label: 'Picos Glaciales',
    incantation: 'glacius',
    key: '3',
    manaCost: 24,
    cooldownMs: 3000,
    kind: 'delayed_area',
    damage: 18,
    range: 7,
    radius: 1.15,
    speed: 0,
    ttl: 0.85,
    color: 0x7dd3fc
  },
  firmament_shield: {
    id: 'firmament_shield',
    label: 'Escudo del Firmamento',
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

import { CLASSES, type CharacterClass } from './classes.js';

export interface ClassSpellVariant {
  id: SpellId;
  label: string;
  incantation: string;
  description: string;
  color: number;
}

export const CLASS_SPELL_VARIANTS: Record<
  CharacterClass,
  Record<SpellId, ClassSpellVariant>
> = {
  arcanist: {
    shadow_dart: {
      id: 'shadow_dart',
      label: 'Dardo Sombrio',
      incantation: 'nox',
      description:
        'Proyectil veloz de sombra que marca al enemigo. La Marca Umbría prepara el terreno para combos devastadores.',
      color: 0x8b5cf6
    },
    void_trap: {
      id: 'void_trap',
      label: 'Trampa del Vacio',
      incantation: 'umbra',
      description:
        'Coloca una trampa invisible en el suelo. Al ser pisada, daña y marca al enemigo con la Marca Umbría.',
      color: 0x4c1d95
    },
    abyssal_claw: {
      id: 'abyssal_claw',
      label: 'Garras Abisales',
      incantation: 'abyssus',
      description:
        'Proyectil oscuro que consume la Marca Umbría para infligir daño extra y silenciar al enemigo.',
      color: 0x7c3aed
    },
    eclipse: {
      id: 'eclipse',
      label: 'Eclipse',
      incantation: 'exanima',
      description:
        'Nova de energía oscura. Por cada enemigo marcado en el área, consume la marca para infligir daño masivo y curarte.',
      color: 0x1e1b4b
    },
    judgment_ray: {
      id: 'judgment_ray',
      label: 'Rayo del Juicio',
      incantation: 'fulgur',
      description: 'Rayo sagrado que castiga con más fuerza a los enemigos debilitados.',
      color: 0xf59e0b
    },
    penitent_seal: {
      id: 'penitent_seal',
      label: 'Sello Penitente',
      incantation: 'judicium',
      description: 'Sello de control que silencia y ralentiza a los enemigos cercanos.',
      color: 0xfef08a
    },
    glacial_spikes: {
      id: 'glacial_spikes',
      label: 'Picos Glaciales',
      incantation: 'glacius',
      description: 'Picos de hielo que emergen del suelo. Congelan a enemigos ya debilitados.',
      color: 0x7dd3fc
    },
    firmament_shield: {
      id: 'firmament_shield',
      label: 'Escudo del Firmamento',
      incantation: 'scutum',
      description: 'Escudo defensivo que puede volverse explosivo cerca de enemigos debilitados.',
      color: 0x93c5fd
    }
  },
  divine: {
    shadow_dart: {
      id: 'shadow_dart',
      label: 'Dardo Sombrio',
      incantation: 'nox',
      description: 'Proyectil veloz de sombra que marca al enemigo.',
      color: 0x8b5cf6
    },
    void_trap: {
      id: 'void_trap',
      label: 'Trampa del Vacio',
      incantation: 'umbra',
      description: 'Coloca una trampa invisible que daña y marca al enemigo.',
      color: 0x4c1d95
    },
    abyssal_claw: {
      id: 'abyssal_claw',
      label: 'Garras Abisales',
      incantation: 'abyssus',
      description: 'Proyectil oscuro que consume marcas para silenciar.',
      color: 0x7c3aed
    },
    eclipse: {
      id: 'eclipse',
      label: 'Eclipse',
      incantation: 'exanima',
      description: 'Nova oscura que consume marcas para curar.',
      color: 0x1e1b4b
    },
    judgment_ray: {
      id: 'judgment_ray',
      label: 'Rayo del Juicio',
      incantation: 'fulgur',
      description:
        'Rayo eléctrico sagrado que viaja veloz. Inflige daño devastador a enemigos silenciados o ralentizados.',
      color: 0xf59e0b
    },
    penitent_seal: {
      id: 'penitent_seal',
      label: 'Sello Penitente',
      incantation: 'judicium',
      description:
        'Explosión circular de luz divina que silencia y ralentiza a los enemigos cercanos.',
      color: 0xfef08a
    },
    glacial_spikes: {
      id: 'glacial_spikes',
      label: 'Picos Glaciales',
      incantation: 'glacius',
      description:
        'Sella el suelo bajo cada enemigo. Si no se apartan, un pico glaciar emerge, daña, empuja y congela a enemigos debilitados.',
      color: 0x7dd3fc
    },
    firmament_shield: {
      id: 'firmament_shield',
      label: 'Escudo del Firmamento',
      incantation: 'scutum',
      description:
        'Escudo celestial que absorbe el siguiente golpe. Si hay un enemigo debilitado cerca, el escudo explota al romperse empujándolo.',
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

export function getSpellIdsForClass(characterClass: CharacterClass): SpellId[] {
  return CLASSES[characterClass].spellIds.filter(isSpellId);
}

export function isSpellAvailableToClass(spellId: SpellId, characterClass: CharacterClass): boolean {
  return getSpellIdsForClass(characterClass).includes(spellId);
}

export function spellIdFromClassSlot(characterClass: CharacterClass, key: string): SpellId | null {
  if (!/^[1-4]$/.test(key)) return null;
  const slot = Number.parseInt(key, 10);
  return getSpellIdsForClass(characterClass)[slot - 1] ?? null;
}

export function spellIdFromClassIncantation(characterClass: CharacterClass, text: string): SpellId | null {
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  const words = normalized.split(' ');

  for (const id of getSpellIdsForClass(characterClass)) {
    const incantation = SPELLS[id].incantation;
    if (words.includes(incantation) || normalized.includes(incantation)) {
      return id;
    }
  }

  return null;
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
