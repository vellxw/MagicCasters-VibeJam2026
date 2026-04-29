import type { VfxDefinition, VfxSequence, VfxLibraryEntry } from './types';

export class VfxLibrary {
  private entries = new Map<string, VfxLibraryEntry>();

  register(definition: VfxLibraryEntry): void {
    this.entries.set(definition.id, definition);
  }

  get(id: string): VfxLibraryEntry | undefined {
    return this.entries.get(id);
  }

  getDefinition(id: string): VfxDefinition | undefined {
    const entry = this.entries.get(id);
    return entry && 'layers' in entry ? (entry as VfxDefinition) : undefined;
  }

  getSequence(id: string): VfxSequence | undefined {
    const entry = this.entries.get(id);
    return entry && 'phases' in entry ? (entry as VfxSequence) : undefined;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  allDefinitions(): VfxDefinition[] {
    const defs: VfxDefinition[] = [];
    for (const entry of this.entries.values()) {
      if ('layers' in entry) {
        defs.push(entry as VfxDefinition);
      }
    }
    return defs;
  }

  allSequences(): VfxSequence[] {
    const seqs: VfxSequence[] = [];
    for (const entry of this.entries.values()) {
      if ('phases' in entry) {
        seqs.push(entry as VfxSequence);
      }
    }
    return seqs;
  }

  clear(): void {
    this.entries.clear();
  }
}
