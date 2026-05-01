import type { PlayerSnapshot } from '../player/LocalPlayerController';
import { countAutoCollisionWalls, isAutoCollisionWall } from '../../../shared/autoCollisionWalls';
import type { ArenaCollisionWall, MatchMode } from '../../../shared/types';
import type { SplatQuality } from '../../../shared/splatMapPool';
import {
  requiredSpawnCountForMode,
  resolveSpawnPointsForMode
} from '../../../shared/splatMapPool';
import type { ArenaDebugInfo } from '../world/ArenaProvider';
import {
  applyCalibrationToPreset,
  calibrationSettingsFromPreset,
  type SplatPresetHistoryEntry,
  type SplatMapEntry,
  type SplatArenaPreset,
  type SplatCalibrationSettings
} from '../world/ArenaPreset';

type FieldName =
  | 'scale'
  | 'offset.x'
  | 'offset.y'
  | 'offset.z'
  | 'rotation.x'
  | 'rotation.y'
  | 'rotation.z'
  | 'floorY'
  | 'bounds.minX'
  | 'bounds.maxX'
  | 'bounds.minZ'
  | 'bounds.maxZ'
  | 'spawn0.x'
  | 'spawn0.y'
  | 'spawn0.z'
  | 'spawn0.rotY'
  | 'spawn1.x'
  | 'spawn1.y'
  | 'spawn1.z'
  | 'spawn1.rotY'
  | 'spawn2.x'
  | 'spawn2.y'
  | 'spawn2.z'
  | 'spawn2.rotY'
  | 'spawn3.x'
  | 'spawn3.y'
  | 'spawn3.z'
  | 'spawn3.rotY';

type WallFieldName = 'x' | 'z' | 'width' | 'depth' | 'height' | 'rotY';

interface CalibrationChangeOptions {
  autosave?: boolean;
}

const FIELD_LABELS: Array<{ field: FieldName; label: string; step: string }> = [
  { field: 'scale', label: 'Scale', step: '0.01' },
  { field: 'offset.x', label: 'Offset X', step: '0.01' },
  { field: 'offset.y', label: 'Offset Y', step: '0.01' },
  { field: 'offset.z', label: 'Offset Z', step: '0.01' },
  { field: 'rotation.x', label: 'Rot X deg', step: '1' },
  { field: 'rotation.y', label: 'Rot Y deg', step: '1' },
  { field: 'rotation.z', label: 'Rot Z deg', step: '1' },
  { field: 'floorY', label: 'Floor Y', step: '0.05' },
  { field: 'bounds.minX', label: 'Min X', step: '0.1' },
  { field: 'bounds.maxX', label: 'Max X', step: '0.1' },
  { field: 'bounds.minZ', label: 'Min Z', step: '0.1' },
  { field: 'bounds.maxZ', label: 'Max Z', step: '0.1' },
  { field: 'spawn0.x', label: 'Spawn A X', step: '0.1' },
  { field: 'spawn0.y', label: 'Spawn A Y', step: '0.05' },
  { field: 'spawn0.z', label: 'Spawn A Z', step: '0.1' },
  { field: 'spawn0.rotY', label: 'Spawn A Rot', step: '0.001' },
  { field: 'spawn1.x', label: 'Spawn B X', step: '0.1' },
  { field: 'spawn1.y', label: 'Spawn B Y', step: '0.05' },
  { field: 'spawn1.z', label: 'Spawn B Z', step: '0.1' },
  { field: 'spawn1.rotY', label: 'Spawn B Rot', step: '0.001' },
  { field: 'spawn2.x', label: 'Spawn C X', step: '0.1' },
  { field: 'spawn2.y', label: 'Spawn C Y', step: '0.05' },
  { field: 'spawn2.z', label: 'Spawn C Z', step: '0.1' },
  { field: 'spawn2.rotY', label: 'Spawn C Rot', step: '0.001' },
  { field: 'spawn3.x', label: 'Spawn D X', step: '0.1' },
  { field: 'spawn3.y', label: 'Spawn D Y', step: '0.05' },
  { field: 'spawn3.z', label: 'Spawn D Z', step: '0.1' },
  { field: 'spawn3.rotY', label: 'Spawn D Rot', step: '0.001' }
];

const WALL_FIELD_LABELS: Array<{ field: WallFieldName; label: string; step: string }> = [
  { field: 'x', label: 'Wall X', step: '0.1' },
  { field: 'z', label: 'Wall Z', step: '0.1' },
  { field: 'width', label: 'Width', step: '0.1' },
  { field: 'depth', label: 'Depth', step: '0.1' },
  { field: 'height', label: 'Height', step: '0.1' },
  { field: 'rotY', label: 'Wall Rot', step: '0.001' }
];

export class SplatCalibrationOverlay {
  readonly element: HTMLDivElement;

  private inputs = new Map<FieldName, HTMLInputElement>();
  private wallInputs = new Map<WallFieldName, HTMLInputElement>();
  private eraserInputs = new Map<WallFieldName, HTMLInputElement>();
  private mapSelect: HTMLSelectElement;
  private qualitySelect: HTMLSelectElement;
  private wallSelect: HTMLSelectElement;
  private eraserSelect: HTMLSelectElement;
  private collisionDebugInput: HTMLInputElement;
  private mode1v1Input: HTMLInputElement;
  private mode2v2Input: HTMLInputElement;
  private spawnModeSelect: HTMLSelectElement;
  private spawnTeleportButtons = new Map<number, HTMLButtonElement>();
  private maps: SplatMapEntry[] = [];
  private preset: SplatArenaPreset | null = null;
  private resetPreset: SplatArenaPreset | null = null;
  private state: SplatCalibrationSettings | null = null;
  private selectedWallIndex = 0;
  private selectedEraserIndex = 0;
  private spawnEditMode: MatchMode = '1v1';
  private latestPlayer: PlayerSnapshot | null = null;
  private saveInfo: SplatPresetHistoryEntry | null = null;
  private statusEl: HTMLElement;
  private feedbackEl: HTMLElement;

  onChange?: (settings: SplatCalibrationSettings, options?: CalibrationChangeOptions) => void;
  onBeforeReset?: (settings: SplatCalibrationSettings) => void;
  onSelectMap?: (presetId: string) => void;
  onSelectQuality?: (quality: SplatQuality) => void;
  onSave?: () => void;
  onPublish?: () => void;
  onUpdateLobby?: () => void;
  onRestoreLast?: () => void;
  onRestoreBackup?: () => void;
  onClearSaved?: () => void;
  onTeleportSpawn?: (index: number) => void;
  onShowCollisionDebug?: (visible: boolean) => void;
  onGenerateAutoCollision?: () => void;
  onClearAutoCollision?: () => void;
  onExit?: () => void;

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'calibration-panel';
    this.element.dataset.visible = 'false';
    this.element.innerHTML = `
      <div class="calibration-panel__header">
        <strong>Splat Calibration</strong>
        <button type="button" data-calibration-exit>Exit</button>
      </div>
      <label class="calibration-panel__map">
        <span>Map</span>
        <select data-calibration-map></select>
      </label>
      <label class="calibration-panel__map">
        <span>Quality</span>
        <select data-calibration-quality></select>
      </label>
      <div class="calibration-panel__map">
        <span>Use map in</span>
        <label class="calibration-panel__toggle">
          <input type="checkbox" data-calibration-mode-1v1>
          <span>1v1</span>
        </label>
        <label class="calibration-panel__toggle">
          <input type="checkbox" data-calibration-mode-2v2>
          <span>2v2</span>
        </label>
        <select data-calibration-spawn-mode>
          <option value="1v1">Editing spawns: 1v1</option>
          <option value="2v2">Editing spawns: 2v2</option>
        </select>
      </div>
      <pre class="calibration-panel__status" data-calibration-status></pre>
      <div class="calibration-panel__grid" data-calibration-fields></div>
      <div class="calibration-panel__walls">
        <div class="calibration-panel__wall-header">
          <strong>Invisible Walls</strong>
          <select data-calibration-wall></select>
        </div>
        <div class="calibration-panel__wall-grid" data-calibration-wall-fields></div>
        <div class="calibration-panel__wall-actions">
          <button type="button" data-calibration-wall-add>Add Wall</button>
          <button type="button" data-calibration-wall-here>Wall Here</button>
          <button type="button" data-calibration-wall-ramp>Ramp Here</button>
          <button type="button" data-calibration-wall-ladder>Toggle Ladder</button>
          <button type="button" data-calibration-wall-delete>Delete Wall</button>
          <button type="button" data-calibration-auto-generate>Generate Auto Collision</button>
          <button type="button" data-calibration-auto-clear>Clear Auto Collision</button>
        </div>
      </div>
      <div class="calibration-panel__walls">
        <div class="calibration-panel__wall-header">
          <strong>Eraser Zones</strong>
          <select data-calibration-eraser></select>
        </div>
        <div class="calibration-panel__wall-grid" data-calibration-eraser-fields></div>
        <div class="calibration-panel__wall-actions">
          <button type="button" data-calibration-eraser-add>Add Eraser Zone</button>
          <button type="button" data-calibration-eraser-here>Eraser Here</button>
          <button type="button" data-calibration-eraser-delete>Delete Eraser</button>
        </div>
      </div>
      <div class="calibration-panel__actions">
        <button type="button" data-calibration-save>Save Config</button>
        <button type="button" data-calibration-publish>Publish Map To Game</button>
        <button type="button" data-calibration-update-lobby>Update Lobby</button>
        <button type="button" data-calibration-restore-last>Restore Last</button>
        <button type="button" data-calibration-restore-backup>Restore Backup</button>
        <button type="button" data-calibration-copy>Copy Preset JSON</button>
        <label class="calibration-panel__toggle">
          <input type="checkbox" data-calibration-collision-debug>
          <span>Show Generated Collision</span>
        </label>
        <button type="button" data-calibration-reset>Reset</button>
        <button type="button" data-calibration-clear-saved>Clear Saved</button>
        <button type="button" data-calibration-spawn-a>Spawn A</button>
        <button type="button" data-calibration-spawn-b>Spawn B</button>
        <button type="button" data-calibration-spawn-c>Spawn C</button>
        <button type="button" data-calibration-spawn-d>Spawn D</button>
      </div>
      <div class="calibration-panel__feedback" data-calibration-feedback></div>
    `;
    root.appendChild(this.element);

    const fieldsEl = this.element.querySelector<HTMLElement>('[data-calibration-fields]')!;
    for (const entry of FIELD_LABELS) {
      const label = document.createElement('label');
      label.className = 'calibration-field';
      label.textContent = entry.label;
      const input = document.createElement('input');
      input.type = 'number';
      input.step = entry.step;
      input.dataset.field = entry.field;
      input.addEventListener('input', () => this.handleInput(entry.field, input));
      label.appendChild(input);
      fieldsEl.appendChild(label);
      this.inputs.set(entry.field, input);
    }

    const wallFieldsEl = this.element.querySelector<HTMLElement>('[data-calibration-wall-fields]')!;
    for (const entry of WALL_FIELD_LABELS) {
      const label = document.createElement('label');
      label.className = 'calibration-field';
      label.textContent = entry.label;
      const input = document.createElement('input');
      input.type = 'number';
      input.step = entry.step;
      input.dataset.wallField = entry.field;
      input.addEventListener('input', () => this.handleWallInput(entry.field, input));
      label.appendChild(input);
      wallFieldsEl.appendChild(label);
      this.wallInputs.set(entry.field, input);
    }

    const eraserFieldsEl = this.element.querySelector<HTMLElement>('[data-calibration-eraser-fields]')!;
    for (const entry of WALL_FIELD_LABELS) {
      const label = document.createElement('label');
      label.className = 'calibration-field';
      label.textContent = entry.label.replace('Wall ', 'Eraser ');
      const input = document.createElement('input');
      input.type = 'number';
      input.step = entry.step;
      input.dataset.eraserField = entry.field;
      input.addEventListener('input', () => this.handleEraserInput(entry.field, input));
      label.appendChild(input);
      eraserFieldsEl.appendChild(label);
      this.eraserInputs.set(entry.field, input);
    }

    this.statusEl = this.element.querySelector('[data-calibration-status]')!;
    this.feedbackEl = this.element.querySelector('[data-calibration-feedback]')!;
    this.mapSelect = this.element.querySelector('[data-calibration-map]')!;
    this.qualitySelect = this.element.querySelector('[data-calibration-quality]')!;
    this.wallSelect = this.element.querySelector('[data-calibration-wall]')!;
    this.eraserSelect = this.element.querySelector('[data-calibration-eraser]')!;
    this.collisionDebugInput = this.element.querySelector('[data-calibration-collision-debug]')!;
    this.mode1v1Input = this.element.querySelector('[data-calibration-mode-1v1]')!;
    this.mode2v2Input = this.element.querySelector('[data-calibration-mode-2v2]')!;
    this.spawnModeSelect = this.element.querySelector('[data-calibration-spawn-mode]')!;
    this.mapSelect.addEventListener('change', () => {
      this.syncQualitySelect();
      this.onSelectMap?.(this.mapSelect.value);
    });
    this.qualitySelect.addEventListener('change', () => this.onSelectQuality?.(this.qualitySelect.value as SplatQuality));
    this.mode1v1Input.addEventListener('change', () => this.handleEnabledModesChange());
    this.mode2v2Input.addEventListener('change', () => this.handleEnabledModesChange());
    this.spawnModeSelect.addEventListener('change', () => this.handleSpawnModeChange(this.spawnModeSelect.value === '2v2' ? '2v2' : '1v1'));
    this.wallSelect.addEventListener('change', () => {
      this.selectedWallIndex = Number.parseInt(this.wallSelect.value, 10) || 0;
      this.syncWallInputs();
    });
    this.eraserSelect.addEventListener('change', () => {
      this.selectedEraserIndex = Number.parseInt(this.eraserSelect.value, 10) || 0;
      this.syncEraserInputs();
    });
    this.element.querySelector('[data-calibration-save]')?.addEventListener('click', () => this.onSave?.());
    this.element.querySelector('[data-calibration-publish]')?.addEventListener('click', () => {
      this.persistActiveSpawnMode();
      if (this.state) {
        this.onChange?.(cloneSettings(this.state), { autosave: false });
      }
      this.onPublish?.();
    });
    this.element.querySelector('[data-calibration-update-lobby]')?.addEventListener('click', () => {
      this.persistActiveSpawnMode();
      if (this.state) {
        this.onChange?.(cloneSettings(this.state), { autosave: false });
      }
      this.onUpdateLobby?.();
    });
    this.element.querySelector('[data-calibration-restore-last]')?.addEventListener('click', () => this.onRestoreLast?.());
    this.element.querySelector('[data-calibration-restore-backup]')?.addEventListener('click', () => this.onRestoreBackup?.());
    this.element.querySelector('[data-calibration-copy]')?.addEventListener('click', () => void this.copyPreset());
    this.element.querySelector('[data-calibration-reset]')?.addEventListener('click', () => this.reset());
    this.element.querySelector('[data-calibration-clear-saved]')?.addEventListener('click', () => this.onClearSaved?.());
    this.element.querySelector('[data-calibration-spawn-a]')?.addEventListener('click', () => this.onTeleportSpawn?.(0));
    this.element.querySelector('[data-calibration-spawn-b]')?.addEventListener('click', () => this.onTeleportSpawn?.(1));
    this.element.querySelector('[data-calibration-spawn-c]')?.addEventListener('click', () => this.onTeleportSpawn?.(2));
    this.element.querySelector('[data-calibration-spawn-d]')?.addEventListener('click', () => this.onTeleportSpawn?.(3));
    for (const [index, selector] of [
      [0, '[data-calibration-spawn-a]'],
      [1, '[data-calibration-spawn-b]'],
      [2, '[data-calibration-spawn-c]'],
      [3, '[data-calibration-spawn-d]']
    ] as const) {
      const button = this.element.querySelector<HTMLButtonElement>(selector);
      if (button) this.spawnTeleportButtons.set(index, button);
    }
    this.element.querySelector('[data-calibration-exit]')?.addEventListener('click', () => this.onExit?.());
    this.collisionDebugInput.addEventListener('change', () => this.toggleCollisionDebug());
    this.element.querySelector('[data-calibration-wall-add]')?.addEventListener('click', () => this.addWall());
    this.element.querySelector('[data-calibration-wall-here]')?.addEventListener('click', () => this.moveWallToPlayer());
    this.element.querySelector('[data-calibration-wall-ramp]')?.addEventListener('click', () => this.addRampWall());
    this.element.querySelector('[data-calibration-wall-ladder]')?.addEventListener('click', () => this.toggleWallLadder());
    this.element.querySelector('[data-calibration-wall-delete]')?.addEventListener('click', () => this.deleteWall());
    this.element.querySelector('[data-calibration-eraser-add]')?.addEventListener('click', () => this.addEraser());
    this.element.querySelector('[data-calibration-eraser-here]')?.addEventListener('click', () => this.moveEraserToPlayer());
    this.element.querySelector('[data-calibration-eraser-delete]')?.addEventListener('click', () => this.deleteEraser());
    this.element.querySelector('[data-calibration-auto-generate]')?.addEventListener('click', () => this.onGenerateAutoCollision?.());
    this.element.querySelector('[data-calibration-auto-clear]')?.addEventListener('click', () => this.onClearAutoCollision?.());
  }

  setMaps(maps: SplatMapEntry[], selectedPresetId: string, selectedQuality: SplatQuality = 'high'): void {
    this.maps = maps;
    this.mapSelect.innerHTML = '';
    for (const map of maps) {
      const option = document.createElement('option');
      option.value = map.presetId;
      option.textContent = map.displayName;
      this.mapSelect.appendChild(option);
    }
    this.mapSelect.value = selectedPresetId;
    this.qualitySelect.value = selectedQuality;
    this.syncQualitySelect(selectedQuality);
  }

  private syncQualitySelect(preferredQuality?: SplatQuality): void {
    const map = this.maps.find((entry) => entry.presetId === this.mapSelect.value) ?? this.maps[0];
    const current = preferredQuality ?? this.qualitySelect.value as SplatQuality;
    const qualities = map?.qualities ?? {};
    const available = (['low', 'mid', 'high'] as const).filter((quality) => qualities[quality]);
    const fallback = map?.defaultQuality ?? 'high';
    const selected = available.includes(current) ? current : available.includes(fallback) ? fallback : available[0] ?? 'high';

    this.qualitySelect.innerHTML = '';
    for (const quality of available.length ? available : [selected]) {
      const option = document.createElement('option');
      option.value = quality;
      option.textContent = quality.toUpperCase();
      this.qualitySelect.appendChild(option);
    }
    this.qualitySelect.value = selected;
    this.qualitySelect.disabled = available.length <= 1;
  }

  show(
    preset: SplatArenaPreset,
    settings: SplatCalibrationSettings = calibrationSettingsFromPreset(preset),
    resetPreset: SplatArenaPreset = preset
  ): void {
    this.preset = preset;
    this.resetPreset = resetPreset;
    this.state = cloneSettings(settings);
    this.spawnEditMode = '1v1';
    this.syncActiveSpawnModeFromState();
    if (this.maps.length === 0) {
      this.setMaps([{
        presetId: preset.calibrationGroupId ?? preset.presetId,
        displayName: preset.displayName,
        presetUrl: '',
        splatUrl: preset.splatUrl,
        splatFileSizeBytes: preset.splatFileSizeBytes,
        enabledModes: [...preset.enabledModes],
        calibrationGroupId: preset.calibrationGroupId,
        quality: preset.quality,
        defaultQuality: preset.quality ?? 'high',
        qualities: {
          [preset.quality ?? 'high']: {
            presetId: preset.presetId,
            presetUrl: '',
            splatUrl: preset.splatUrl,
            splatFileSizeBytes: preset.splatFileSizeBytes
          }
        }
      }], preset.calibrationGroupId ?? preset.presetId, preset.quality ?? 'high');
    } else {
      this.mapSelect.value = preset.calibrationGroupId ?? preset.presetId;
      this.syncQualitySelect(preset.quality ?? 'high');
    }
    this.syncInputs();
    this.syncModeInputs();
    this.syncSpawnModeControls();
    this.syncWallSelect();
    this.syncEraserSelect();
    this.collisionDebugInput.checked = false;
    this.collisionDebugInput.disabled = !preset.collisionMeshUrl;
    this.feedbackEl.textContent = 'Tune values live, then copy the preset JSON.';
    this.element.dataset.visible = 'true';
    this.updateStatus(null, null);
  }

  hide(): void {
    this.element.dataset.visible = 'false';
    this.preset = null;
    this.resetPreset = null;
    this.state = null;
    this.latestPlayer = null;
    this.saveInfo = null;
  }

  setFeedback(message: string): void {
    this.feedbackEl.textContent = message;
  }

  setSaveInfo(entry: SplatPresetHistoryEntry | null): void {
    this.saveInfo = entry;
  }

  setPreset(preset: SplatArenaPreset): void {
    this.preset = preset;
    this.collisionDebugInput.disabled = !preset.collisionMeshUrl;
    if (!preset.collisionMeshUrl) {
      this.collisionDebugInput.checked = false;
    }
  }

  setSettings(settings: SplatCalibrationSettings): void {
    this.state = cloneSettings(settings);
    this.syncActiveSpawnModeFromState();
    this.syncInputs();
    this.syncModeInputs();
    this.syncSpawnModeControls();
    this.syncWallSelect();
    this.syncEraserSelect();
  }

  updateStatus(info: ArenaDebugInfo | null, player: PlayerSnapshot | null): void {
    if (this.element.dataset.visible !== 'true') return;
    this.latestPlayer = player;
    const state = this.state;
    const preset = this.preset;
    this.statusEl.textContent = [
      `arena ${info?.arenaId ?? preset?.arenaId ?? 'splat-test'}`,
      `preset ${preset?.presetId ?? 'none'}`,
      `splatUrl ${info?.splatUrl ?? preset?.splatUrl ?? 'pending'}`,
      `fileSize ${formatBytes(info?.splatFileSizeBytes ?? preset?.splatFileSizeBytes)}`,
      `load ${info?.splatLoadStatus ?? 'idle'}`,
      `collision ${collisionLabel(info?.collisionStatus ?? 'none')} debug ${info?.collisionDebugVisible ? 'on' : 'off'}`,
      `occlusion ${info?.occlusionStatus ?? 'none'}`,
      state ? `scale ${formatNumber(state.scale)}` : '',
      state ? `offset ${vectorLine(state.offset)}` : '',
      state ? `rotation ${vectorLine(state.rotation)}` : '',
      state ? `floorY ${formatNumber(state.floorY)}` : '',
      state ? `bounds x${formatNumber(state.bounds.minX)}..${formatNumber(state.bounds.maxX)} z${formatNumber(state.bounds.minZ)}..${formatNumber(state.bounds.maxZ)}` : '',
      state ? `enabled modes ${state.enabledModes.length ? state.enabledModes.join(',') : 'none'} editing spawns ${this.spawnEditMode} (${state.spawnPoints.length})` : '',
      info ? `auto collision ${info.voxelCollisionStatus ?? 'none'} ${info.voxelCollisionUrl ?? 'none'}` : '',
      state ? `manual blockers ${state.collisionWalls.filter((wall) => !wall.climbable && !isAutoCollisionWall(wall)).length} legacy auto ${countAutoCollisionWalls(state.collisionWalls)} ladders ${state.collisionWalls.filter((wall) => wall.climbable).length} erasers ${state.collisionErasers.length}` : '',
      `saved ${formatSaveInfo(this.saveInfo)}`,
      player ? `player ${formatNumber(player.x)},${formatNumber(player.y)},${formatNumber(player.z)}` : 'player none',
      'controls WASD/arrows move, Space jumps/climbs ladders, mouse aim, F8/Esc exits'
    ].filter(Boolean).join('\n');
  }

  private handleInput(field: FieldName, input: HTMLInputElement): void {
    if (!this.state) return;
    const value = Number.parseFloat(input.value);
    if (!Number.isFinite(value)) return;
    setFieldValue(this.state, field, field === 'scale' ? Math.max(0.001, value) : value);
    if (field.startsWith('spawn')) {
      this.persistActiveSpawnMode();
    }
    this.onChange?.(cloneSettings(this.state));
  }

  private handleEnabledModesChange(): void {
    if (!this.state) return;
    const enabledModes: MatchMode[] = [];
    if (this.mode1v1Input.checked) enabledModes.push('1v1');
    if (this.mode2v2Input.checked) enabledModes.push('2v2');
    this.state.enabledModes = enabledModes;
    this.onChange?.(cloneSettings(this.state));
    this.feedbackEl.textContent = enabledModes.length
      ? `Map will be available in ${enabledModes.join(' and ')} after publishing.`
      : 'Map disabled for matchmaking until you enable 1v1 or 2v2 and publish.';
  }

  private handleSpawnModeChange(mode: MatchMode): void {
    if (!this.state || mode === this.spawnEditMode) return;
    this.persistActiveSpawnMode();
    this.spawnEditMode = mode;
    this.syncActiveSpawnModeFromState();
    this.syncInputs();
    this.syncSpawnModeControls();
    this.onChange?.(cloneSettings(this.state));
    this.feedbackEl.textContent = `Editing ${mode} spawn points.`;
  }

  private handleWallInput(field: WallFieldName, input: HTMLInputElement): void {
    if (!this.state) return;
    const wall = this.selectedWall();
    if (!wall) return;
    const value = Number.parseFloat(input.value);
    if (!Number.isFinite(value)) return;
    if (field === 'width' || field === 'depth' || field === 'height') {
      wall[field] = Math.max(0.1, value);
    } else {
      wall[field] = value;
    }
    this.onChange?.(cloneSettings(this.state));
  }

  private handleEraserInput(field: WallFieldName, input: HTMLInputElement): void {
    if (!this.state) return;
    const eraser = this.selectedEraser();
    if (!eraser) return;
    const value = Number.parseFloat(input.value);
    if (!Number.isFinite(value)) return;
    if (field === 'width' || field === 'depth' || field === 'height') {
      eraser[field] = Math.max(0.1, value);
    } else {
      eraser[field] = value;
    }
    this.onChange?.(cloneSettings(this.state));
  }

  private addWall(): void {
    if (!this.state) return;
    const player = this.latestPlayer;
    const wall: ArenaCollisionWall = {
      id: `wall-${Date.now().toString(36)}`,
      x: player?.x ?? 0,
      z: player?.z ?? 0,
      width: 2,
      depth: 0.35,
      height: 2,
      rotY: player?.rotY ?? 0,
      climbable: false,
      ramp: false
    };
    this.state.collisionWalls.push(wall);
    this.selectedWallIndex = this.state.collisionWalls.length - 1;
    this.syncWallSelect();
    this.onChange?.(cloneSettings(this.state));
    this.feedbackEl.textContent = 'Invisible wall added. It is visible only while calibrating.';
  }

  private addRampWall(): void {
    if (!this.state) return;
    const player = this.latestPlayer;
    const wall: ArenaCollisionWall = {
      id: `ramp-${Date.now().toString(36)}`,
      x: player?.x ?? 0,
      z: player?.z ?? 0,
      width: 5.5,
      depth: 4,
      height: 1.2,
      rotY: player?.rotY ?? 0,
      climbable: false,
      ramp: true
    };
    this.state.collisionWalls.push(wall);
    this.selectedWallIndex = this.state.collisionWalls.length - 1;
    this.syncWallSelect();
    this.onChange?.(cloneSettings(this.state));
    this.feedbackEl.textContent = 'Ramp wall added. Rotate it with Wall Rot; turn it 180 degrees to flip the slope.';
  }

  private moveWallToPlayer(): void {
    if (!this.state) return;
    let wall = this.selectedWall();
    if (!wall) {
      this.addWall();
      wall = this.selectedWall();
    }
    if (!wall || !this.latestPlayer) return;
    wall.x = this.latestPlayer.x;
    wall.z = this.latestPlayer.z;
    wall.rotY = this.latestPlayer.rotY;
    this.syncWallInputs();
    this.onChange?.(cloneSettings(this.state));
    this.feedbackEl.textContent = 'Selected wall moved to player position.';
  }

  private toggleWallLadder(): void {
    if (!this.state) return;
    const wall = this.selectedWall();
    if (!wall) return;
    wall.climbable = !wall.climbable;
    if (wall.climbable) wall.ramp = false;
    this.syncWallSelect();
    this.wallSelect.value = String(this.selectedWallIndex);
    this.syncWallInputs();
    this.onChange?.(cloneSettings(this.state));
    this.feedbackEl.textContent = wall.climbable
      ? 'Selected wall is now a climbable ladder trigger.'
      : 'Selected ladder is now a normal invisible wall blocker.';
  }

  private deleteWall(): void {
    if (!this.state) return;
    if (this.state.collisionWalls.length === 0) return;
    this.state.collisionWalls.splice(this.selectedWallIndex, 1);
    this.selectedWallIndex = Math.max(0, Math.min(this.selectedWallIndex, this.state.collisionWalls.length - 1));
    this.syncWallSelect();
    this.onChange?.(cloneSettings(this.state));
    this.feedbackEl.textContent = 'Invisible wall deleted.';
  }

  private addEraser(): void {
    if (!this.state) return;
    const player = this.latestPlayer;
    const eraser: ArenaCollisionWall = {
      id: `eraser-${Date.now().toString(36)}`,
      x: player?.x ?? 0,
      z: player?.z ?? 0,
      width: 2,
      depth: 2,
      height: 2,
      rotY: player?.rotY ?? 0,
      climbable: false
    };
    this.state.collisionErasers.push(eraser);
    this.selectedEraserIndex = this.state.collisionErasers.length - 1;
    this.syncEraserSelect();
    this.onChange?.(cloneSettings(this.state));
    this.feedbackEl.textContent = 'Eraser zone added. It subtracts voxel collision only; manual walls stay active.';
  }

  private moveEraserToPlayer(): void {
    if (!this.state) return;
    let eraser = this.selectedEraser();
    if (!eraser) {
      this.addEraser();
      eraser = this.selectedEraser();
    }
    if (!eraser || !this.latestPlayer) return;
    eraser.x = this.latestPlayer.x;
    eraser.z = this.latestPlayer.z;
    eraser.rotY = this.latestPlayer.rotY;
    this.syncEraserInputs();
    this.onChange?.(cloneSettings(this.state));
    this.feedbackEl.textContent = 'Selected eraser zone moved to player position.';
  }

  private deleteEraser(): void {
    if (!this.state) return;
    if (this.state.collisionErasers.length === 0) return;
    this.state.collisionErasers.splice(this.selectedEraserIndex, 1);
    this.selectedEraserIndex = Math.max(0, Math.min(this.selectedEraserIndex, this.state.collisionErasers.length - 1));
    this.syncEraserSelect();
    this.onChange?.(cloneSettings(this.state));
    this.feedbackEl.textContent = 'Eraser zone deleted.';
  }

  private reset(): void {
    if (!this.preset || !this.state) return;
    this.onBeforeReset?.(cloneSettings(this.state));
    this.state = calibrationSettingsFromPreset(this.resetPreset ?? this.preset);
    this.spawnEditMode = '1v1';
    this.syncActiveSpawnModeFromState();
    this.syncInputs();
    this.syncModeInputs();
    this.syncSpawnModeControls();
    this.syncWallSelect();
    this.syncEraserSelect();
    this.onChange?.(cloneSettings(this.state), { autosave: false });
    this.feedbackEl.textContent = 'Reset applied. A before-reset backup was kept.';
  }

  private toggleCollisionDebug(): void {
    if (!this.preset?.collisionMeshUrl) {
      this.collisionDebugInput.checked = false;
      this.feedbackEl.textContent = 'No generated collision mesh is configured for this preset yet.';
      this.onShowCollisionDebug?.(false);
      return;
    }
    this.onShowCollisionDebug?.(this.collisionDebugInput.checked);
    this.feedbackEl.textContent = this.collisionDebugInput.checked
      ? 'Generated collision guide visible. Use it as a reference, then retouch invisible walls.'
      : 'Generated collision guide hidden.';
  }

  private syncActiveSpawnModeFromState(): void {
    if (!this.state) return;
    this.state.spawnPoints = resolveSpawnPointsForMode(this.state, this.spawnEditMode).map((spawn) => ({ ...spawn }));
    ensureSpawnCountForMode(this.state, this.spawnEditMode);
    this.persistActiveSpawnMode();
  }

  private persistActiveSpawnMode(): void {
    if (!this.state) return;
    ensureSpawnCountForMode(this.state, this.spawnEditMode);
    this.state.spawnPointsByMode = {
      ...this.state.spawnPointsByMode,
      [this.spawnEditMode]: this.state.spawnPoints.map((spawn) => ({ ...spawn }))
    };
    this.state.spawnPoints = resolveSpawnPointsForMode(this.state, '1v1').map((spawn) => ({ ...spawn }));
    if (this.spawnEditMode !== '1v1') {
      this.state.spawnPoints = resolveSpawnPointsForMode(this.state, this.spawnEditMode).map((spawn) => ({ ...spawn }));
    }
  }

  private syncModeInputs(): void {
    if (!this.state) return;
    this.mode1v1Input.checked = this.state.enabledModes.includes('1v1');
    this.mode2v2Input.checked = this.state.enabledModes.includes('2v2');
  }

  private syncSpawnModeControls(): void {
    this.spawnModeSelect.value = this.spawnEditMode;
    const requiredCount = requiredSpawnCountForMode(this.spawnEditMode);
    for (const field of this.inputs.keys()) {
      const match = /^spawn(\d+)\./.exec(field);
      const label = this.inputs.get(field)?.parentElement as HTMLElement | null;
      if (match && label) {
        label.style.display = Number(match[1]) < requiredCount ? '' : 'none';
      }
    }
    for (const [index, button] of this.spawnTeleportButtons) {
      button.style.display = index < requiredCount ? '' : 'none';
    }
  }

  private syncInputs(): void {
    if (!this.state) return;
    for (const field of this.inputs.keys()) {
      const input = this.inputs.get(field)!;
      input.value = String(roundForInput(getFieldValue(this.state, field)));
    }
    this.syncSpawnModeControls();
    this.syncWallInputs();
    this.syncEraserInputs();
  }

  private syncWallSelect(): void {
    if (!this.state) return;
    this.wallSelect.innerHTML = '';
    if (this.state.collisionWalls.length === 0) {
      const option = document.createElement('option');
      option.value = '0';
      option.textContent = 'No walls';
      this.wallSelect.appendChild(option);
      this.selectedWallIndex = 0;
    } else {
      this.selectedWallIndex = Math.max(0, Math.min(this.selectedWallIndex, this.state.collisionWalls.length - 1));
      this.state.collisionWalls.forEach((wall, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        const kind = wall.ramp ? 'Ramp' : wall.climbable ? 'Ladder' : isAutoCollisionWall(wall) ? 'Auto' : 'Wall';
        option.textContent = `${index + 1}: ${kind} ${wall.id}`;
        this.wallSelect.appendChild(option);
      });
    }
    this.wallSelect.value = String(this.selectedWallIndex);
    this.syncWallInputs();
  }

  private syncWallInputs(): void {
    const wall = this.selectedWall();
    for (const field of this.wallInputs.keys()) {
      const input = this.wallInputs.get(field)!;
      input.disabled = !wall;
      input.value = wall ? String(roundForInput(wall[field])) : '';
    }
  }

  private syncEraserSelect(): void {
    if (!this.state) return;
    this.eraserSelect.innerHTML = '';
    if (this.state.collisionErasers.length === 0) {
      const option = document.createElement('option');
      option.value = '0';
      option.textContent = 'No erasers';
      this.eraserSelect.appendChild(option);
      this.selectedEraserIndex = 0;
    } else {
      this.selectedEraserIndex = Math.max(0, Math.min(this.selectedEraserIndex, this.state.collisionErasers.length - 1));
      this.state.collisionErasers.forEach((eraser, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${index + 1}: Eraser ${eraser.id}`;
        this.eraserSelect.appendChild(option);
      });
    }
    this.eraserSelect.value = String(this.selectedEraserIndex);
    this.syncEraserInputs();
  }

  private syncEraserInputs(): void {
    const eraser = this.selectedEraser();
    for (const field of this.eraserInputs.keys()) {
      const input = this.eraserInputs.get(field)!;
      input.disabled = !eraser;
      input.value = eraser ? String(roundForInput(eraser[field])) : '';
    }
  }

  private selectedWall(): ArenaCollisionWall | null {
    if (!this.state) return null;
    return this.state.collisionWalls[this.selectedWallIndex] ?? null;
  }

  private selectedEraser(): ArenaCollisionWall | null {
    if (!this.state) return null;
    return this.state.collisionErasers[this.selectedEraserIndex] ?? null;
  }

  private async copyPreset(): Promise<void> {
    if (!this.preset || !this.state) return;
    this.persistActiveSpawnMode();
    const exportPreset = applyCalibrationToPreset(this.preset, this.state);
    const json = `${JSON.stringify(exportPreset, null, 2)}\n`;
    try {
      await navigator.clipboard.writeText(json);
      this.feedbackEl.textContent = 'Preset JSON copied to clipboard.';
    } catch {
      const copied = fallbackCopy(json);
      this.feedbackEl.textContent = copied ? 'Preset JSON copied to clipboard.' : 'Clipboard failed; select values manually.';
    }
  }
}

function cloneSettings(settings: SplatCalibrationSettings): SplatCalibrationSettings {
  return {
    scale: settings.scale,
    rotation: { ...settings.rotation },
    offset: { ...settings.offset },
    floorY: settings.floorY,
    bounds: { ...settings.bounds },
    enabledModes: [...settings.enabledModes],
    spawnPoints: settings.spawnPoints.map((spawn) => ({ ...spawn })),
    spawnPointsByMode: {
      '1v1': settings.spawnPointsByMode['1v1']?.map((spawn) => ({ ...spawn })),
      '2v2': settings.spawnPointsByMode['2v2']?.map((spawn) => ({ ...spawn }))
    },
    collisionErasers: settings.collisionErasers.map((eraser) => ({ ...eraser })),
    collisionWalls: settings.collisionWalls.map((wall) => ({ ...wall }))
  };
}

function getFieldValue(state: SplatCalibrationSettings, field: FieldName): number {
  switch (field) {
    case 'scale': return state.scale;
    case 'offset.x': return state.offset.x;
    case 'offset.y': return state.offset.y;
    case 'offset.z': return state.offset.z;
    case 'rotation.x': return state.rotation.x;
    case 'rotation.y': return state.rotation.y;
    case 'rotation.z': return state.rotation.z;
    case 'floorY': return state.floorY;
    case 'bounds.minX': return state.bounds.minX;
    case 'bounds.maxX': return state.bounds.maxX;
    case 'bounds.minZ': return state.bounds.minZ;
    case 'bounds.maxZ': return state.bounds.maxZ;
    case 'spawn0.x': return state.spawnPoints[0]?.x ?? 0;
    case 'spawn0.y': return state.spawnPoints[0]?.y ?? 0;
    case 'spawn0.z': return state.spawnPoints[0]?.z ?? 0;
    case 'spawn0.rotY': return state.spawnPoints[0]?.rotY ?? 0;
    case 'spawn1.x': return state.spawnPoints[1]?.x ?? 0;
    case 'spawn1.y': return state.spawnPoints[1]?.y ?? 0;
    case 'spawn1.z': return state.spawnPoints[1]?.z ?? 0;
    case 'spawn1.rotY': return state.spawnPoints[1]?.rotY ?? 0;
    case 'spawn2.x': return state.spawnPoints[2]?.x ?? 0;
    case 'spawn2.y': return state.spawnPoints[2]?.y ?? 0;
    case 'spawn2.z': return state.spawnPoints[2]?.z ?? 0;
    case 'spawn2.rotY': return state.spawnPoints[2]?.rotY ?? 0;
    case 'spawn3.x': return state.spawnPoints[3]?.x ?? 0;
    case 'spawn3.y': return state.spawnPoints[3]?.y ?? 0;
    case 'spawn3.z': return state.spawnPoints[3]?.z ?? 0;
    case 'spawn3.rotY': return state.spawnPoints[3]?.rotY ?? 0;
  }
}

function setFieldValue(state: SplatCalibrationSettings, field: FieldName, value: number): void {
  ensureSpawnCount(state, 4);
  switch (field) {
    case 'scale': state.scale = value; break;
    case 'offset.x': state.offset.x = value; break;
    case 'offset.y': state.offset.y = value; break;
    case 'offset.z': state.offset.z = value; break;
    case 'rotation.x': state.rotation.x = value; break;
    case 'rotation.y': state.rotation.y = value; break;
    case 'rotation.z': state.rotation.z = value; break;
    case 'floorY': state.floorY = value; break;
    case 'bounds.minX': state.bounds.minX = value; break;
    case 'bounds.maxX': state.bounds.maxX = value; break;
    case 'bounds.minZ': state.bounds.minZ = value; break;
    case 'bounds.maxZ': state.bounds.maxZ = value; break;
    case 'spawn0.x': state.spawnPoints[0].x = value; break;
    case 'spawn0.y': state.spawnPoints[0].y = value; break;
    case 'spawn0.z': state.spawnPoints[0].z = value; break;
    case 'spawn0.rotY': state.spawnPoints[0].rotY = value; break;
    case 'spawn1.x': state.spawnPoints[1].x = value; break;
    case 'spawn1.y': state.spawnPoints[1].y = value; break;
    case 'spawn1.z': state.spawnPoints[1].z = value; break;
    case 'spawn1.rotY': state.spawnPoints[1].rotY = value; break;
    case 'spawn2.x': state.spawnPoints[2].x = value; break;
    case 'spawn2.y': state.spawnPoints[2].y = value; break;
    case 'spawn2.z': state.spawnPoints[2].z = value; break;
    case 'spawn2.rotY': state.spawnPoints[2].rotY = value; break;
    case 'spawn3.x': state.spawnPoints[3].x = value; break;
    case 'spawn3.y': state.spawnPoints[3].y = value; break;
    case 'spawn3.z': state.spawnPoints[3].z = value; break;
    case 'spawn3.rotY': state.spawnPoints[3].rotY = value; break;
  }
}

function ensureSpawnCountForMode(state: SplatCalibrationSettings, mode: MatchMode): void {
  ensureSpawnCount(state, requiredSpawnCountForMode(mode));
}

function ensureSpawnCount(state: SplatCalibrationSettings, count: number): void {
  while (state.spawnPoints.length < count) {
    const mirror = state.spawnPoints[state.spawnPoints.length % Math.max(1, state.spawnPoints.length)];
    state.spawnPoints.push({
      x: mirror ? mirror.x : 0,
      y: mirror ? mirror.y : state.floorY,
      z: mirror ? mirror.z + 1 : 0,
      rotY: mirror ? mirror.rotY : 0
    });
  }
}

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  return copied;
}

function vectorLine(value: { x: number; y: number; z: number }): string {
  return `${formatNumber(value.x)},${formatNumber(value.y)},${formatNumber(value.z)}`;
}

function collisionLabel(value: string): string {
  return value === 'loaded' ? 'mesh' : value;
}

function formatSaveInfo(entry: SplatPresetHistoryEntry | null): string {
  if (!entry) return 'none';
  const date = new Date(entry.savedAt);
  const dateText = Number.isNaN(date.getTime())
    ? entry.savedAt
    : date.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  return `${entry.reason} ${dateText}`;
}

function formatBytes(value: number | undefined): string {
  if (!value) return 'unknown';
  const mib = value / (1024 * 1024);
  return `${mib.toFixed(2)} MiB`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function roundForInput(value: number): number {
  return Math.round(value * 1000) / 1000;
}
