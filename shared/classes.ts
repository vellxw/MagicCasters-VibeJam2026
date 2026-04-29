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
    title: 'Hechicero Oscuro',
    description:
      'Maestro del fuego abisal y las sombras. Especialista en engano y destruccion arcana.',
    modelPath: '/models/mago-negro.glb',
    texturePrefix: 'mn',
    themeColor: 0x7c3aed,
    spellIds: ['fireball', 'ice_bolt', 'light_burst']
  },
  divine: {
    id: 'divine',
    name: 'Divine',
    title: 'Hechicero Divino',
    description:
      'Canalizador de luz celestial y electricidad sagrada. Protector y juez del campo de batalla.',
    modelPath: '/models/mago-blanco.glb',
    texturePrefix: 'mb',
    themeColor: 0xf59e0b,
    spellIds: ['fireball', 'ice_bolt', 'light_burst']
  }
};

export function isCharacterClass(value: string): value is CharacterClass {
  return value === 'arcanist' || value === 'divine';
}
