import type { VfxDefinition, VfxSequence } from './types';

export class VfxLoader {
  async loadDefinition(id: string): Promise<VfxDefinition> {
    const res = await fetch(`/vfx/${id}.json`);
    if (!res.ok) {
      throw new Error(`Failed to load VFX definition "${id}": ${res.status} ${res.statusText}`);
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error(`Invalid JSON for VFX definition "${id}": ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!this.isVfxDefinition(data)) {
      throw new Error(`Invalid VFX definition structure for "${id}"`);
    }
    return data;
  }

  async loadSequence(id: string): Promise<VfxSequence> {
    const res = await fetch(`/vfx/${id}.json`);
    if (!res.ok) {
      throw new Error(`Failed to load VFX sequence "${id}": ${res.status} ${res.statusText}`);
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error(`Invalid JSON for VFX sequence "${id}": ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!this.isVfxSequence(data)) {
      throw new Error(`Invalid VFX sequence structure for "${id}"`);
    }
    return data;
  }

  async loadAllFromIndex(): Promise<VfxDefinition[]> {
    const res = await fetch('/vfx/index.json');
    if (!res.ok) {
      throw new Error(`Failed to load VFX index: ${res.status} ${res.statusText}`);
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error(`Invalid JSON for VFX index: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!Array.isArray(data)) {
      throw new Error('VFX index must be an array');
    }
    const definitions: VfxDefinition[] = [];
    for (const item of data) {
      if (typeof item === 'string') {
        try {
          definitions.push(await this.loadDefinition(item));
        } catch (err) {
          console.warn(`[VfxLoader] Skipped missing/invalid definition "${item}":`, err);
        }
      } else if (this.isVfxDefinition(item)) {
        definitions.push(item);
      } else {
        console.warn('[VfxLoader] Skipped invalid index entry:', item);
      }
    }
    return definitions;
  }

  private isVfxDefinition(data: unknown): data is VfxDefinition {
    return (
      typeof data === 'object' &&
      data !== null &&
      'id' in data &&
      'name' in data &&
      'duration' in data &&
      'loop' in data &&
      'attachTo' in data &&
      'layers' in data
    );
  }

  private isVfxSequence(data: unknown): data is VfxSequence {
    return (
      typeof data === 'object' &&
      data !== null &&
      'id' in data &&
      'name' in data &&
      'type' in data &&
      (data as Record<string, unknown>).type === 'sequence' &&
      'phases' in data
    );
  }
}
