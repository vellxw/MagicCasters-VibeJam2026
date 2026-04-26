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
    manaCost: 20,
    cooldownMs: 4000,
    kind: 'dash',
    damage: 0,
    range: 4.5,
    radius: 0,
    speed: 0,
    ttl: 0.3,
    color: 0xa78bfa
  }
};

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
