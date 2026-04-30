import type { SplatMapEntry } from '../world/ArenaPreset';
// Note: splatMapPool types moved to ArenaPreset to avoid circular deps
import type { MapVfxEntry } from '../vfx/MapVfxConfig';

interface VfxEditorCallbacks {
  onSelectMap?: (presetId: string) => void;
  onAddEffect?: (vfxId: string) => void;
  onDeleteEffect?: (index: number) => void;
  onUpdateEffect?: (index: number, entry: MapVfxEntry) => void;
  onTeleport?: (x: number, y: number, z: number) => void;
  onSave?: () => void;
  onPublish?: () => void;
  onExit?: () => void;
}

const AVAILABLE_VFX = [
  'portal_electric',
  'portal_electric_blue',
  'portal_electric_orange',
  'portal_spin'
];

export class VfxEditorOverlay {
  private element: HTMLDivElement;
  private statusEl: HTMLElement;
  private addSelect: HTMLSelectElement;
  private addButton: HTMLButtonElement;
  private effectListEl: HTMLElement;
  private feedbackEl: HTMLElement;
  private cameraInfoEl: HTMLElement;
  private mapSelect: HTMLSelectElement;

  private effects: MapVfxEntry[] = [];
  private selectedIndex = -1;
  private maps: SplatMapEntry[] = [];

  onChange?: (index: number, field: string, value: number) => void;
  onSelectMap?: (presetId: string) => void;
  onAddEffect?: (vfxId: string) => void;
  onDeleteEffect?: (index: number) => void;
  onSave?: () => void;
  onPublish?: () => void;
  onExit?: () => void;

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'calibration-panel';
    this.element.dataset.visible = 'false';
    this.element.innerHTML = `
      <div class="calibration-panel__header">
        <strong>VFX Editor (F9)</strong>
        <button type="button" data-vfx-exit>Exit</button>
      </div>
      <label class="calibration-panel__map">
        <span>Map</span>
        <select data-vfx-map></select>
      </label>
      <div class="calibration-panel__actions">
        <select data-vfx-add-select></select>
        <button type="button" data-vfx-add>Add Effect Here</button>
      </div>
      <div class="calibration-panel__map">
        <strong>Effects</strong>
      </div>
      <div data-vfx-effects></div>
      <div class="calibration-panel__grid" data-vfx-fields></div>
      <div class="calibration-panel__actions">
        <button type="button" data-vfx-save>Save Config</button>
        <button type="button" data-vfx-publish>Publish VFX To Game</button>
      </div>
      <div class="calibration-panel__feedback" data-vfx-feedback></div>
      <pre class="calibration-panel__status" data-vfx-status></pre>
    `;
    root.appendChild(this.element);

    this.statusEl = this.element.querySelector('[data-vfx-status]')!;
    this.feedbackEl = this.element.querySelector('[data-vfx-feedback]')!;
    this.effectListEl = this.element.querySelector('[data-vfx-effects]')!;
    this.mapSelect = this.element.querySelector('[data-vfx-map]')!;
    this.addSelect = this.element.querySelector('[data-vfx-add-select]')!;
    this.addButton = this.element.querySelector('[data-vfx-add]')!;
    this.cameraInfoEl = this.element.querySelector('[data-vfx-status]')!;

    for (const id of AVAILABLE_VFX) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = id;
      this.addSelect.appendChild(option);
    }

    this.addButton.addEventListener('click', () => {
      this.onAddEffect?.(this.addSelect.value);
    });

    this.element.querySelector('[data-vfx-save]')?.addEventListener('click', () => this.onSave?.());
    this.element.querySelector('[data-vfx-publish]')?.addEventListener('click', () => this.onPublish?.());
    this.element.querySelector('[data-vfx-exit]')?.addEventListener('click', () => this.onExit?.());
    this.mapSelect.addEventListener('change', () => {
      this.onSelectMap?.(this.mapSelect.value);
    });
  }

  setMaps(maps: SplatMapEntry[], selectedPresetId: string): void {
    this.maps = maps;
    this.mapSelect.innerHTML = '';
    for (const map of maps) {
      const option = document.createElement('option');
      option.value = map.presetId;
      option.textContent = map.displayName;
      this.mapSelect.appendChild(option);
    }
    this.mapSelect.value = selectedPresetId;
  }

  setEffects(effects: MapVfxEntry[]): void {
    this.effects = effects;
    this.selectedIndex = -1;
    this.renderEffectList();
    this.renderFields();
  }

  getEffects(): MapVfxEntry[] {
    return this.effects.map((e) => ({ ...e, position: { ...e.position }, rotation: { ...e.rotation } }));
  }

  addEffect(entry: MapVfxEntry): void {
    this.effects.push(entry);
    this.selectedIndex = this.effects.length - 1;
    this.renderEffectList();
    this.renderFields();
  }

  removeEffect(index: number): void {
    this.effects.splice(index, 1);
    if (this.selectedIndex >= this.effects.length) this.selectedIndex = this.effects.length - 1;
    this.renderEffectList();
    this.renderFields();
  }

  show(): void {
    this.element.dataset.visible = 'true';
  }

  hide(): void {
    this.element.dataset.visible = 'false';
  }

  setFeedback(message: string): void {
    this.feedbackEl.textContent = message;
  }

  updateStatus(position: { x: number; y: number; z: number } | null, rotY: number | null): void {
    if (position) {
      this.cameraInfoEl.textContent = `Pos: ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)} | Rot: ${(rotY ?? 0).toFixed(3)}`;
    }
  }

  private renderEffectList(): void {
    this.effectListEl.innerHTML = '';
    for (let i = 0; i < this.effects.length; i++) {
      const effect = this.effects[i];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:center;padding:4px 0;cursor:pointer;';
      if (i === this.selectedIndex) {
        row.style.background = 'rgba(247,231,198,0.12)';
      }
      const label = document.createElement('span');
      label.textContent = `${effect.id} (${effect.vfxId})`;
      label.style.cssText = 'flex:1;color:#f7e7c6;font-size:12px;';
      row.appendChild(label);

      const delBtn = document.createElement('button');
      delBtn.textContent = 'X';
      delBtn.style.cssText = 'min-height:auto;padding:2px 6px;border:1px solid rgba(247,231,198,0.2);background:rgba(0,0,0,0.24);color:#f7e7c6;font-size:11px;';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onDeleteEffect?.(i);
      });
      row.appendChild(delBtn);

      row.addEventListener('click', () => {
        this.selectedIndex = i;
        this.renderEffectList();
        this.renderFields();
      });

      this.effectListEl.appendChild(row);
    }
  }

  private renderFields(): void {
    const container = this.element.querySelector('[data-vfx-fields]') as HTMLElement;
    container.innerHTML = '';
    if (this.selectedIndex < 0 || this.selectedIndex >= this.effects.length) return;

    const effect = this.effects[this.selectedIndex];
    const fields: Array<{ key: string; label: string; value: number; step: string }> = [
      { key: 'position.x', label: 'Pos X', value: effect.position.x, step: '0.1' },
      { key: 'position.y', label: 'Pos Y', value: effect.position.y, step: '0.05' },
      { key: 'position.z', label: 'Pos Z', value: effect.position.z, step: '0.1' },
      { key: 'rotation.x', label: 'Rot X', value: effect.rotation.x, step: '0.01' },
      { key: 'rotation.y', label: 'Rot Y', value: effect.rotation.y, step: '0.01' },
      { key: 'rotation.z', label: 'Rot Z', value: effect.rotation.z, step: '0.01' },
      { key: 'scale', label: 'Scale', value: effect.scale, step: '0.01' }
    ];

    for (const field of fields) {
      const label = document.createElement('label');
      label.className = 'calibration-field';
      label.textContent = field.label;
      const input = document.createElement('input');
      input.type = 'number';
      input.step = field.step;
      input.value = String(field.value);
      const idx = this.selectedIndex;
      const key = field.key;
      input.addEventListener('input', () => {
        this.updateField(idx, key, Number(input.value));
      });
      label.appendChild(input);
      container.appendChild(label);
    }
  }

  private updateField(index: number, key: string, value: number): void {
    if (index < 0 || index >= this.effects.length) return;
    if (!Number.isFinite(value)) return;
    const effect = this.effects[index];
    if (key.startsWith('position.')) {
      const axis = key.slice(9) as 'x' | 'y' | 'z';
      effect.position[axis] = value;
    } else if (key.startsWith('rotation.')) {
      const axis = key.slice(9) as 'x' | 'y' | 'z';
      effect.rotation[axis] = value;
    } else if (key === 'scale') {
      effect.scale = value;
    }
    this.onChange?.(index, key, value);
  }
}