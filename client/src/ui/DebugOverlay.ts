import { SPELLS, type SpellId } from '../../../shared/spells';
import { CLASSES, type CharacterClass } from '../../../shared/classes';
import type { ArenaId, MatchMode } from '../../../shared/types';
import type { PlayerSnapshot } from '../player/LocalPlayerController';
import type { ArenaDebugInfo } from '../world/ArenaProvider';

type SceneMode = 'LOBBY' | 'CHARACTER_SELECT' | 'QUEUE' | 'MATCH' | 'RESULTS' | 'CALIBRATION' | 'VFX_EDITOR';

export class DebugOverlay {
  readonly element: HTMLDivElement;
  readonly voiceButton: HTMLButtonElement;

  private hpFill: HTMLSpanElement;
  private manaFill: HTMLSpanElement;
  private nameEl: HTMLElement;
  private phaseEl: HTMLElement;
  private dockEl: HTMLElement;
  private promptEl: HTMLElement;
  private promptTextEl: HTMLElement;
  private promptButtonEl: HTMLButtonElement;
  private queueEl: HTMLElement;
  private queueModeEl: HTMLElement;
  private queueCountEl: HTMLElement;
  private resultsEl: HTMLElement;
  private resultsMessageEl: HTMLElement;
  private debugEl: HTMLElement;
  private toastEl: HTMLElement;
  private spellButtons = new Map<SpellId, HTMLButtonElement>();
  private toastTimer = 0;

  onCast?: (spellId: SpellId) => void;
  onVoiceToggle?: () => void;
  onCancelQueue?: () => void;
  onReturnLobby?: () => void;
  onPortalAction?: () => void;
  onQualitySettings?: () => void;

  private characterClass: CharacterClass = 'arcanist';

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'hud';
    this.element.innerHTML = `
      <div class="hud__top">
        <div class="status-stack">
          <div class="status-row"><strong data-name>Mage</strong><span data-room>offline</span></div>
          <div class="bars">
            <div class="bar bar--hp"><span data-hp></span></div>
            <div class="bar bar--mana"><span data-mana></span></div>
          </div>
        </div>
        <div class="hud__top-right">
          <button type="button" class="quality-chip" data-quality-settings>⚙ Calidad</button>
          <div class="phase-chip" data-phase>Entering arena</div>
        </div>
      </div>
      <div class="interaction-prompt" data-prompt>
        <span data-prompt-text></span>
        <button type="button" data-portal-action></button>
      </div>
      <div class="queue-panel" data-queue>
        <strong>Finding match...</strong>
        <span data-queue-mode>Mode</span>
        <span data-queue-count>0 / 2 players</span>
        <button type="button" data-cancel-queue>Cancel</button>
      </div>
      <div class="results-panel" data-results>
        <strong>Match ended</strong>
        <span data-results-message>Return to lobby to play again.</span>
        <button type="button" data-return-lobby>Return to lobby</button>
      </div>
      <div class="spell-dock" data-spells></div>
      <div class="crosshair" aria-hidden="true"></div>
      <div class="debug" data-debug></div>
      <div class="toast" data-toast></div>
    `;

    root.appendChild(this.element);
    this.hpFill = this.element.querySelector('[data-hp]')!;
    this.manaFill = this.element.querySelector('[data-mana]')!;
    this.nameEl = this.element.querySelector('[data-name]')!;
    this.phaseEl = this.element.querySelector('[data-phase]')!;
    this.dockEl = this.element.querySelector('[data-spells]')!;
    this.promptEl = this.element.querySelector('[data-prompt]')!;
    this.promptTextEl = this.element.querySelector('[data-prompt-text]')!;
    this.promptButtonEl = this.element.querySelector('[data-portal-action]')!;
    this.queueEl = this.element.querySelector('[data-queue]')!;
    this.queueModeEl = this.element.querySelector('[data-queue-mode]')!;
    this.queueCountEl = this.element.querySelector('[data-queue-count]')!;
    this.resultsEl = this.element.querySelector('[data-results]')!;
    this.resultsMessageEl = this.element.querySelector('[data-results-message]')!;
    this.debugEl = this.element.querySelector('[data-debug]')!;
    this.toastEl = this.element.querySelector('[data-toast]')!;
    this.element.querySelector('[data-cancel-queue]')?.addEventListener('click', () => this.onCancelQueue?.());
    this.element.querySelector('[data-return-lobby]')?.addEventListener('click', () => this.onReturnLobby?.());
    this.promptButtonEl.addEventListener('click', () => this.onPortalAction?.());
    this.element.querySelector('[data-quality-settings]')?.addEventListener('click', () => this.onQualitySettings?.());

    this.voiceButton = document.createElement('button');
    this.voiceButton.className = 'voice-button';
    this.voiceButton.textContent = 'Voice';
    this.voiceButton.dataset.active = 'false';
    this.voiceButton.addEventListener('click', () => this.onVoiceToggle?.());
    this.rebuildSpellDock();
  }

  setCharacterClass(characterClass: CharacterClass): void {
    if (this.characterClass !== characterClass) {
      this.characterClass = characterClass;
      this.rebuildSpellDock();
    }
  }

  private rebuildSpellDock(): void {
    this.dockEl.innerHTML = '';
    this.spellButtons.clear();
    const classDef = CLASSES[this.characterClass];
    for (const id of classDef.spellIds as SpellId[]) {
      const spell = SPELLS[id];
      const button = document.createElement('button');
      button.className = 'spell-button';
      button.style.setProperty('--spell-color', `#${spell.color.toString(16).padStart(6, '0')}`);
      button.innerHTML = `<b>${spell.key} ${spell.incantation}</b><span>${spell.label}</span>`;
      button.addEventListener('click', () => this.onCast?.(id));
      this.dockEl.appendChild(button);
      this.spellButtons.set(id, button);
    }
    if (!this.dockEl.contains(this.voiceButton)) {
      this.dockEl.appendChild(this.voiceButton);
    }
  }

  update(args: {
    scene: SceneMode;
    selectedMode: MatchMode | null;
    selectedArenaId: ArenaId;
    phase: string;
    status: string;
    roomId: string;
    local?: PlayerSnapshot;
    playerCount: number;
    requiredPlayers: number;
    teamId: string | null;
    projectileCount: number;
    voiceActive: boolean;
    voiceText: string;
    localSessionId: string | null;
    localPlayerBound: boolean;
    controlsEnabled: boolean;
    cameraPitch: number;
    portalPrompt: string;
    portalActionLabel: string;
    queueActive: boolean;
    resultsActive: boolean;
    resultsMessage: string;
    arenaDebug: ArenaDebugInfo | null;
  }): void {
    const hp = args.local?.hp ?? 100;
    const mana = args.local?.mana ?? 100;
    this.hpFill.style.transform = `scaleX(${Math.max(0, Math.min(1, hp / 100))})`;
    this.manaFill.style.transform = `scaleX(${Math.max(0, Math.min(1, mana / 100))})`;
    this.nameEl.textContent = args.local?.name ?? 'Mage';
    const roomEl = this.element.querySelector<HTMLElement>('[data-room]');
    if (roomEl) roomEl.textContent = args.roomId ? args.roomId.slice(0, 6) : args.status;
    this.phaseEl.textContent = messageForPhase(args.scene, args.phase, args.playerCount, args.requiredPlayers);
    this.voiceButton.dataset.active = String(args.voiceActive);
    this.dockEl.dataset.active = String(args.scene === 'MATCH');
    this.promptTextEl.textContent = args.portalPrompt;
    this.promptButtonEl.textContent = args.portalActionLabel ? `Entrar: ${args.portalActionLabel}` : 'Entrar';
    this.promptEl.dataset.visible = String(Boolean(args.portalPrompt));
    this.queueEl.dataset.visible = String(args.queueActive);
    this.queueModeEl.textContent = `Mode: ${labelForSelection(args.selectedMode, args.selectedArenaId)}`;
    this.queueCountEl.textContent = `${args.playerCount} / ${args.requiredPlayers} players`;
    this.resultsEl.dataset.visible = String(args.resultsActive);
    this.resultsMessageEl.textContent = args.resultsMessage || 'Return to lobby to play again.';

    const now = Date.now();
    for (const [id, button] of this.spellButtons) {
      if (!args.local) continue;
      const readyAt = cooldownFor(args.local, id);
      const cooldown = Math.max(0, readyAt - now) / SPELLS[id].cooldownMs;
      button.style.setProperty('--cooldown', `${1 - Math.min(1, cooldown)}`);
      button.disabled = cooldown > 0 || args.local.mana < SPELLS[id].manaCost || args.phase !== 'PLAYING';
    }

    this.debugEl.textContent = [
      `scene ${args.scene.toLowerCase()}`,
      `net ${args.status}`,
      `selected ${args.selectedMode ?? 'none'}`,
      `arena ${args.selectedArenaId}`,
      `room ${args.roomId ? args.roomId.slice(0, 6) : 'none'}`,
      `mode ${args.selectedMode ?? 'none'}`,
      `team ${args.teamId ?? 'none'}`,
      `phase ${args.phase}`,
      `players ${args.playerCount}/${args.requiredPlayers}`,
      `projectiles ${args.projectileCount}`,
      `session ${args.localSessionId?.slice(0, 6) ?? 'none'}`,
      `local ${args.localPlayerBound ? 'yes' : 'no'}`,
      `controls ${args.controlsEnabled ? 'yes' : 'no'}`,
      `camera first-person pitch ${toDegrees(args.cameraPitch)}`,
      ...arenaDebugLines(args.arenaDebug),
      args.local ? `pos ${args.local.x.toFixed(2)},${args.local.y.toFixed(2)},${args.local.z.toFixed(2)}` : 'pos none',
      `voice ${args.voiceActive ? 'on' : 'off'}`,
      args.voiceText ? `heard ${args.voiceText.slice(0, 24)}` : ''
    ].filter(Boolean).join('\n');
  }

  showToast(message: string): void {
    window.clearTimeout(this.toastTimer);
    this.toastEl.textContent = message;
    this.toastEl.dataset.visible = 'true';
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.dataset.visible = 'false';
    }, 1300);
  }
}

function toDegrees(value: number): string {
  return `${Math.round(value * 180 / Math.PI)}deg`;
}

function cooldownFor(player: PlayerSnapshot, spellId: SpellId): number {
  switch (spellId) {
    case 'shadow_dart':
      return player.shadowDartReadyAt ?? 0;
    case 'void_trap':
      return player.voidTrapReadyAt ?? 0;
    case 'abyssal_claw':
      return player.abyssalClawReadyAt ?? 0;
    case 'eclipse':
      return player.eclipseReadyAt ?? 0;
    case 'judgment_ray':
      return player.judgmentRayReadyAt ?? 0;
    case 'penitent_seal':
      return player.penitentSealReadyAt ?? 0;
    case 'glacial_spikes':
      return player.glacialSpikesReadyAt ?? 0;
    case 'firmament_shield':
      return player.firmamentShieldReadyAt ?? 0;
    default:
      return 0;
  }
}

function messageForPhase(scene: SceneMode, phase: string, count: number, required: number): string {
  if (scene === 'LOBBY') return 'Choose a duel portal';
  if (scene === 'CHARACTER_SELECT') return 'Choose your mage';
  if (scene === 'CALIBRATION') return 'Splat calibration';
  if (scene === 'QUEUE') return `Queue ${count}/${required}`;
  if (scene === 'RESULTS') return 'Return to lobby';
  if (phase === 'PLAYING') return 'Duel live';
  if (phase === 'ENDED') return 'Duel sealed';
  if (count < required) return 'Waiting for rivals';
  return 'Binding room';
}

function labelForSelection(mode: MatchMode | null, arenaId: ArenaId): string {
  if (arenaId === 'splat-test') return 'Realistic Arena Test';
  if (mode === '2v2') return '2v2 Team Duel';
  if (mode === '1v1') return '1v1 Duel';
  return 'Portal';
}

function arenaDebugLines(info: ArenaDebugInfo | null): string[] {
  if (!info) return [];
  return [
    `splat ${info.splatLoadStatus}`,
    `splatUrl ${shortUrl(info.splatUrl)}`,
    `splatSize ${formatBytes(info.splatFileSizeBytes)}`,
    `collision ${info.collisionStatus === 'loaded' ? 'mesh' : info.collisionStatus} debug ${info.collisionDebugVisible ? 'on' : 'off'}`,
    `occlusion ${info.occlusionStatus ?? 'none'}`,
    `voxel ${info.voxelCollisionStatus ?? 'none'} ${info.voxelCollisionUrl ? shortUrl(info.voxelCollisionUrl) : 'none'}`,
    `scale ${info.scale}`,
    `offset ${vectorLine(info.offset)}`,
    `rotation ${vectorLine(info.rotation)}`,
    `floorY ${info.floorY}`,
    `bounds x${info.bounds.minX}..${info.bounds.maxX} z${info.bounds.minZ}..${info.bounds.maxZ}`,
    `walls ${info.collisionWallCount ?? 0} erasers ${info.collisionEraserCount ?? 0}`
  ];
}

function vectorLine(value: { x: number; y: number; z: number }): string {
  return `${value.x},${value.y},${value.z}`;
}

function shortUrl(value: string): string {
  return value.length > 34 ? `...${value.slice(-31)}` : value;
}

function formatBytes(value: number | undefined): string {
  if (!value) return 'unknown';
  return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
}
