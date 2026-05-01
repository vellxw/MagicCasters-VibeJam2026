import type { CharacterClass } from '../../../shared/classes';
import { getSpellIdsForClass, type SpellId } from '../../../shared/spells';

export const COMBAT_KEYBINDINGS_STORAGE_KEY = 'mc_combat_keybindings_v1';
export const COMBAT_ACTIONS = ['spell1', 'spell2', 'spell3', 'spell4'] as const;

export type CombatAction = (typeof COMBAT_ACTIONS)[number];

export interface CombatKeyBinding {
  code: string;
  key: string;
}

export type CombatKeyBindings = Record<CombatAction, CombatKeyBinding>;

export interface CombatKeyBindingsStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export interface CombatKeyInput {
  code?: string;
  key?: string;
}

export const DEFAULT_COMBAT_KEY_BINDINGS: CombatKeyBindings = {
  spell1: { code: 'Digit1', key: '1' },
  spell2: { code: 'Digit2', key: '2' },
  spell3: { code: 'Digit3', key: '3' },
  spell4: { code: 'Digit4', key: '4' }
};

const RESERVED_CODES = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowLeft',
  'ArrowDown',
  'ArrowRight',
  'Space',
  'Escape',
  'Enter',
  'Tab',
  'F8',
  'F9'
]);

export function loadCombatKeyBindings(storage = browserStorage()): CombatKeyBindings {
  if (!storage) return cloneCombatKeyBindings(DEFAULT_COMBAT_KEY_BINDINGS);
  const raw = storage.getItem(COMBAT_KEYBINDINGS_STORAGE_KEY);
  if (!raw) return cloneCombatKeyBindings(DEFAULT_COMBAT_KEY_BINDINGS);
  try {
    return normalizeCombatKeyBindings(JSON.parse(raw));
  } catch {
    return cloneCombatKeyBindings(DEFAULT_COMBAT_KEY_BINDINGS);
  }
}

export function saveCombatKeyBindings(
  bindings: CombatKeyBindings,
  storage = browserStorage()
): CombatKeyBindings {
  const normalized = normalizeCombatKeyBindings(bindings);
  storage?.setItem(COMBAT_KEYBINDINGS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function normalizeCombatKeyBindings(value: unknown): CombatKeyBindings {
  let normalized = cloneCombatKeyBindings(DEFAULT_COMBAT_KEY_BINDINGS);
  const source = typeof value === 'object' && value !== null
    ? value as Partial<Record<CombatAction, unknown>>
    : {};

  for (const action of COMBAT_ACTIONS) {
    const binding = normalizeCombatKeyInput(source[action]);
    if (binding) {
      normalized = assignCombatKeyBinding(normalized, action, binding);
    }
  }

  return normalized;
}

export function assignCombatKeyBinding(
  bindings: CombatKeyBindings,
  action: CombatAction,
  input: string | CombatKeyInput
): CombatKeyBindings {
  const binding = normalizeCombatKeyInput(input);
  const next = cloneCombatKeyBindings(bindings);
  if (!binding) return next;

  const previous = next[action];
  const duplicateAction = COMBAT_ACTIONS.find((candidate) => (
    candidate !== action && next[candidate].code === binding.code
  ));

  next[action] = binding;
  if (duplicateAction) {
    next[duplicateAction] = previous;
  }

  return next;
}

export function resolveCombatSpellForClass(
  characterClass: CharacterClass,
  input: string | CombatKeyInput,
  bindings: CombatKeyBindings = DEFAULT_COMBAT_KEY_BINDINGS
): SpellId | null {
  const action = resolveCombatAction(input, bindings);
  if (!action) return null;
  const slot = COMBAT_ACTIONS.indexOf(action);
  return getSpellIdsForClass(characterClass)[slot] ?? null;
}

export function resolveCombatAction(
  input: string | CombatKeyInput,
  bindings: CombatKeyBindings = DEFAULT_COMBAT_KEY_BINDINGS
): CombatAction | null {
  const normalized = normalizeCombatKeyInput(input, { allowReserved: true });
  if (!normalized) return null;
  const match = COMBAT_ACTIONS.find((action) => bindings[action].code === normalized.code);
  return match ?? null;
}

export function normalizeCombatKeyInput(
  input: unknown,
  options: { allowReserved?: boolean } = {}
): CombatKeyBinding | null {
  const parsed = parseCombatKeyInput(input);
  if (!parsed) return null;
  if (!options.allowReserved && RESERVED_CODES.has(parsed.code)) return null;
  return parsed;
}

export function formatCombatKeyBinding(binding: CombatKeyBinding): string {
  if (binding.key && binding.key.length === 1) {
    return /[a-z]/i.test(binding.key) ? binding.key.toUpperCase() : binding.key;
  }
  if (binding.code.startsWith('Digit')) return binding.code.slice(5);
  if (binding.code.startsWith('Key')) return binding.code.slice(3);
  if (binding.code.startsWith('Numpad')) return binding.code.replace('Numpad', 'Num ');
  return binding.key || binding.code;
}

export function combatActionLabel(action: CombatAction): string {
  return `Spell ${COMBAT_ACTIONS.indexOf(action) + 1}`;
}

function parseCombatKeyInput(input: unknown): CombatKeyBinding | null {
  if (typeof input === 'string') {
    return fromStringInput(input);
  }
  if (typeof input !== 'object' || input === null) return null;

  const candidate = input as Partial<CombatKeyInput>;
  const code = typeof candidate.code === 'string' ? candidate.code.trim() : '';
  const key = typeof candidate.key === 'string' ? candidate.key.trim() : '';
  if (code) {
    return { code, key: key || keyFromCode(code) };
  }
  return key ? fromStringInput(key) : null;
}

function fromStringInput(value: string): CombatKeyBinding | null {
  const key = value.trim();
  if (!key) return null;
  if (/^Digit[0-9]$/.test(key) || /^Key[A-Z]$/.test(key) || key.startsWith('Arrow') || key.startsWith('Numpad')) {
    return { code: key, key: keyFromCode(key) };
  }
  if (/^[0-9]$/.test(key)) return { code: `Digit${key}`, key };
  if (/^[a-z]$/i.test(key)) return { code: `Key${key.toUpperCase()}`, key: key.toLowerCase() };
  return { code: key.length === 1 ? key : key, key };
}

function keyFromCode(code: string): string {
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code === 'Space') return 'Space';
  return code;
}

function cloneCombatKeyBindings(bindings: CombatKeyBindings): CombatKeyBindings {
  return {
    spell1: { ...bindings.spell1 },
    spell2: { ...bindings.spell2 },
    spell3: { ...bindings.spell3 },
    spell4: { ...bindings.spell4 }
  };
}

function browserStorage(): CombatKeyBindingsStorage | null {
  return typeof window !== 'undefined' ? window.localStorage : null;
}
