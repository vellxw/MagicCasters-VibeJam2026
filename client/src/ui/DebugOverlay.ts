import { SPELLS, type SpellId } from '../../../shared/spells';
import { CLASSES, type CharacterClass } from '../../../shared/classes';
import type { ArenaId, MatchMode } from '../../../shared/types';
import type { PlayerSnapshot } from '../player/LocalPlayerController';
import type { ArenaDebugInfo } from '../world/ArenaProvider';
import {
  formatStatusTime,
  getActiveStatusEffects,
  getSpellAvailability
} from './SpellAvailability';

type SceneMode = 'LOBBY' | 'CUSTOM' | 'CHARACTER_SELECT' | 'QUEUE' | 'MATCH' | 'RESULTS' | 'CALIBRATION' | 'VFX_EDITOR';

export class DebugOverlay {
  readonly element: HTMLDivElement;
  readonly voiceButton: HTMLButtonElement;

  private hpFill: HTMLSpanElement;
  private manaFill: HTMLSpanElement;
  private nameEl: HTMLElement;
  private statusEffectsEl: HTMLElement;
  private phaseEl: HTMLElement;
  private dockEl: HTMLElement;
  private combatStateEl: HTMLElement;
  private promptEl: HTMLElement;
  private promptTextEl: HTMLElement;
  private promptButtonEl: HTMLButtonElement;
  private queueEl: HTMLElement;
  private queueModeEl: HTMLElement;
  private queueCountEl: HTMLElement;
  private resultsEl: HTMLElement;
  private resultsImageEl: HTMLImageElement;
  private resultsMessageEl: HTMLElement;
  private rematchStatusEl: HTMLElement;
  private rematchButtonEl: HTMLButtonElement;
  private toastEl: HTMLElement;
  private spellButtons = new Map<SpellId, HTMLButtonElement>();
  private toastTimer = 0;

  onCast?: (spellId: SpellId) => void;
  onVoiceToggle?: () => void;
  onCancelQueue?: () => void;
  onReturnLobby?: () => void;
  onRematch?: () => void;
  onPlayDifferentMatch?: () => void;
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
          <div class="status-effects" data-status-effects></div>
        </div>
        <div class="hud__top-right">
          <button type="button" class="quality-chip" data-quality-settings>⚙ Settings</button>
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
        <img class="results-panel__image" data-results-image alt="Match result" />
        <span data-results-message>Return to lobby to play again.</span>
        <span class="results-panel__rematch" data-rematch-status></span>
        <div class="results-panel__actions">
          <button type="button" data-rematch>Rematch</button>
          <button type="button" data-different-match>Play Different Match</button>
        </div>
      </div>
      <div class="spell-dock" data-spells></div>
      <div class="crosshair" aria-hidden="true"></div>
      <div class="combat-state-vignette" data-combat-state aria-hidden="true"></div>
      <div class="toast" data-toast></div>
    `;

    root.appendChild(this.element);
    this.hpFill = this.element.querySelector('[data-hp]')!;
    this.manaFill = this.element.querySelector('[data-mana]')!;
    this.nameEl = this.element.querySelector('[data-name]')!;
    this.statusEffectsEl = this.element.querySelector('[data-status-effects]')!;
    this.phaseEl = this.element.querySelector('[data-phase]')!;
    this.dockEl = this.element.querySelector('[data-spells]')!;
    this.combatStateEl = this.element.querySelector('[data-combat-state]')!;
    this.promptEl = this.element.querySelector('[data-prompt]')!;
    this.promptTextEl = this.element.querySelector('[data-prompt-text]')!;
    this.promptButtonEl = this.element.querySelector('[data-portal-action]')!;
    this.queueEl = this.element.querySelector('[data-queue]')!;
    this.queueModeEl = this.element.querySelector('[data-queue-mode]')!;
    this.queueCountEl = this.element.querySelector('[data-queue-count]')!;
    this.resultsEl = this.element.querySelector('[data-results]')!;
    this.resultsImageEl = this.element.querySelector('[data-results-image]')!;
    this.resultsMessageEl = this.element.querySelector('[data-results-message]')!;
    this.rematchStatusEl = this.element.querySelector('[data-rematch-status]')!;
    this.rematchButtonEl = this.element.querySelector('[data-rematch]')!;
    this.toastEl = this.element.querySelector('[data-toast]')!;
    this.element.querySelector('[data-cancel-queue]')?.addEventListener('click', () => this.onCancelQueue?.());
    this.rematchButtonEl.addEventListener('click', () => this.onRematch?.());
    this.element.querySelector('[data-different-match]')?.addEventListener('click', () => this.onPlayDifferentMatch?.());
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
      button.innerHTML = `
        <b>${spell.key} ${spell.incantation}</b>
        <span>${spell.label}</span>
        <small data-spell-state>Ready</small>
      `;
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
    resultKind: 'victory' | 'defeat';
    resultsMessage: string;
    rematchAvailable: boolean;
    rematchVotes: number;
    rematchRequired: number;
    rematchRequested: boolean;
    arenaDebug: ArenaDebugInfo | null;
  }): void {
    this.element.dataset.scene = args.scene.toLowerCase();
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
    this.promptButtonEl.textContent = args.portalActionLabel ? `Enter: ${args.portalActionLabel}` : 'Enter';
    this.promptEl.dataset.visible = String(Boolean(args.portalPrompt));
    this.queueEl.dataset.visible = String(args.queueActive);
    this.queueModeEl.textContent = `Mode: ${labelForSelection(args.selectedMode, args.selectedArenaId)}`;
    this.queueCountEl.textContent = `${args.playerCount} / ${args.requiredPlayers} players`;
    this.resultsEl.dataset.visible = String(args.resultsActive);
    this.resultsEl.dataset.result = args.resultKind;
    this.resultsImageEl.src = args.resultKind === 'victory' ? '/results/victory.png' : '/results/defeat.png';
    this.resultsImageEl.alt = args.resultKind === 'victory' ? 'Victory' : 'Defeat';
    this.resultsMessageEl.textContent = args.resultsMessage || 'Return to lobby to play again.';
    this.rematchButtonEl.disabled = !args.rematchAvailable || args.rematchRequested;
    this.rematchButtonEl.textContent = args.rematchRequested ? 'Rematch Ready' : 'Rematch';
    this.rematchStatusEl.textContent = args.rematchAvailable
      ? `Waiting for players ${args.rematchVotes}/${args.rematchRequired}`
      : 'Rematch unavailable';

    const now = Date.now();
    const effects = getActiveStatusEffects(args.local, now);
    this.renderStatusEffects(effects);
    const primaryState = primaryCombatState(effects);
    this.combatStateEl.dataset.state = primaryState;
    this.combatStateEl.dataset.active = String(args.scene === 'MATCH' && primaryState !== 'none');

    for (const [id, button] of this.spellButtons) {
      const availability = getSpellAvailability({
        player: args.local,
        spellId: id,
        phase: args.phase,
        now
      });
      const labelEl = button.querySelector<HTMLElement>('[data-spell-state]');
      button.style.setProperty('--cooldown', `${availability.cooldownProgress}`);
      button.dataset.state = availability.reason;
      button.dataset.canCast = String(availability.canCast);
      button.setAttribute('aria-disabled', String(!availability.canCast));
      button.title = availability.canCast ? `${SPELLS[id].label} ready` : availability.label;
      button.disabled = false;
      if (labelEl) labelEl.textContent = availability.label;
    }

  }

  private renderStatusEffects(effects: ReturnType<typeof getActiveStatusEffects>): void {
    this.statusEffectsEl.innerHTML = '';
    this.statusEffectsEl.dataset.active = String(effects.length > 0);
    for (const effect of effects) {
      const chip = document.createElement('span');
      chip.className = 'status-effect';
      chip.dataset.effect = effect.id;
      const time = formatStatusTime(effect.remainingMs);
      chip.textContent = time ? `${effect.label} ${time}` : effect.label;
      this.statusEffectsEl.appendChild(chip);
    }
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

function primaryCombatState(effects: ReturnType<typeof getActiveStatusEffects>): string {
  if (effects.some((effect) => effect.id === 'silenced')) return 'silenced';
  if (effects.some((effect) => effect.id === 'rooted')) return 'rooted';
  if (effects.some((effect) => effect.id === 'slowed')) return 'slowed';
  if (effects.some((effect) => effect.id === 'marked')) return 'marked';
  if (effects.some((effect) => effect.id === 'shielded')) return 'shielded';
  return 'none';
}

function messageForPhase(scene: SceneMode, phase: string, count: number, required: number): string {
  if (scene === 'LOBBY') return 'Choose a duel portal';
  if (scene === 'CUSTOM') return 'Custom invite';
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
  if (arenaId === 'splat-test') return 'CUSTOM Arena';
  if (mode === '2v2') return '2v2 Team Duel';
  if (mode === '1v1') return '1v1 Duel';
  return 'Portal';
}

