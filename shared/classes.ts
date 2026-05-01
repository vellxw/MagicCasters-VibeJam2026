export type CharacterClass = 'arcanist' | 'divine';

export interface ClassDefinition {
  id: CharacterClass;
  name: string;
  title: string;
  description: string;
  modelPath: string;
  texturePrefix: string;
  themeColor: number;
  spellIds: string[];
}

export const CLASSES: Record<CharacterClass, ClassDefinition> = {
  arcanist: {
    id: 'arcanist',
    name: 'Arcanist',
    title: 'Dark Sorcerer',
    description:
      'A master of deception and arcane destruction. Applies umbral marks and consumes them for devastating combos.',
    modelPath: '/models/mago-negro.glb',
    texturePrefix: 'mn',
    themeColor: 0x7c3aed,
    spellIds: ['shadow_dart', 'void_trap', 'abyssal_claw', 'eclipse']
  },
  divine: {
    id: 'divine',
    name: 'Divine',
    title: 'Divine Sorcerer',
    description:
      'A channeler of celestial light who punishes weakened enemies with glacial spikes and sacred rays.',
    modelPath: '/models/mago-blanco.glb',
    texturePrefix: 'mb',
    themeColor: 0xf59e0b,
    spellIds: ['judgment_ray', 'penitent_seal', 'glacial_spikes', 'firmament_shield']
  }
};

export function isCharacterClass(value: string): value is CharacterClass {
  return value === 'arcanist' || value === 'divine';
}
