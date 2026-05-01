import { describe, expect, it } from 'vitest';
import { SPELL_IDS, SPELLS } from '../../../shared/spells';

type VfxJsonModule = { default: { id?: string; layers?: unknown[] } | string[] };

const modules = import.meta.glob('../../public/vfx/*.json', { eager: true }) as Record<string, VfxJsonModule>;

function readJsonModule(id: string): VfxJsonModule['default'] | undefined {
  return Object.entries(modules).find(([path]) => path.endsWith(`/vfx/${id}.json`))?.[1].default;
}

describe('VFX asset integrity', () => {
  it('keeps every indexed VFX id equal to its filename and non-empty', () => {
    const index = readJsonModule('index') as string[];

    expect(index.length).toBeGreaterThan(0);
    for (const vfxId of index) {
      const definition = readJsonModule(vfxId) as { id?: string; layers?: unknown[] } | undefined;
      expect(definition, `${vfxId}.json must exist`).toBeTruthy();
      expect(definition?.id).toBe(vfxId);
      expect(definition?.layers?.length).toBeGreaterThan(0);
    }
  });

  it('indexes readable spell phases and explicit resolution events', () => {
    const index = readJsonModule('index') as string[];

    expect(index).toEqual(expect.arrayContaining([
      'trap_placed',
      'trap_triggered',
      'mark_applied',
      'mark_consumed',
      'ground_line_hit',
      'glacial_spikes_telegraph',
      'glacial_spikes_erupt',
      'shield_exploded'
    ]));

    for (const spellId of SPELL_IDS) {
      expect(index).toContain(`${spellId}_cast`);
      if (SPELLS[spellId].kind === 'projectile') {
        expect(index).toContain(`${spellId}_projectile`);
        expect(index).toContain(`${spellId}_impact`);
      }
      if (SPELLS[spellId].kind === 'instant' || SPELLS[spellId].kind === 'ground_line') {
        expect(index).toContain(`${spellId}_impact`);
      }
    }
  });
});
