import { SPELL_IDS, SPELLS, type SpellId } from '../../../shared/spells';
import type { PlayerSnapshot } from '../player/LocalPlayerController';

export class DebugOverlay {
  readonly element: HTMLDivElement;
  readonly voiceButton: HTMLButtonElement;

  private hpFill: HTMLSpanElement;
  private manaFill: HTMLSpanElement;
  private nameEl: HTMLElement;
  private phaseEl: HTMLElement;
  private debugEl: HTMLElement;
  private toastEl: HTMLElement;
  private spellButtons = new Map<SpellId, HTMLButtonElement>();
  private toastTimer = 0;

  onCast?: (spellId: SpellId) => void;
  onVoiceToggle?: () => void;

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
        <div class="phase-chip" data-phase>Entering arena</div>
      </div>
      <div class="spell-dock" data-spells></div>
      <div class="debug" data-debug></div>
      <div class="toast" data-toast></div>
    `;

    root.appendChild(this.element);
    this.hpFill = this.element.querySelector('[data-hp]')!;
    this.manaFill = this.element.querySelector('[data-mana]')!;
    this.nameEl = this.element.querySelector('[data-name]')!;
    this.phaseEl = this.element.querySelector('[data-phase]')!;
    this.debugEl = this.element.querySelector('[data-debug]')!;
    this.toastEl = this.element.querySelector('[data-toast]')!;

    const dock = this.element.querySelector<HTMLElement>('[data-spells]')!;
    for (const id of SPELL_IDS) {
      const spell = SPELLS[id];
      const button = document.createElement('button');
      button.className = 'spell-button';
      button.style.setProperty('--spell-color', `#${spell.color.toString(16).padStart(6, '0')}`);
      button.innerHTML = `<b>${spell.key} ${spell.incantation}</b><span>${spell.label}</span>`;
      button.addEventListener('click', () => this.onCast?.(id));
      dock.appendChild(button);
      this.spellButtons.set(id, button);
    }

    this.voiceButton = document.createElement('button');
    this.voiceButton.className = 'voice-button';
    this.voiceButton.textContent = 'Voice';
    this.voiceButton.dataset.active = 'false';
    this.voiceButton.addEventListener('click', () => this.onVoiceToggle?.());
    dock.appendChild(this.voiceButton);
  }

  update(args: {
    phase: string;
    status: string;
    roomId: string;
    local?: PlayerSnapshot;
    playerCount: number;
    projectileCount: number;
    voiceActive: boolean;
    voiceText: string;
    localSessionId: string | null;
    localPlayerBound: boolean;
    controlsEnabled: boolean;
  }): void {
    const hp = args.local?.hp ?? 100;
    const mana = args.local?.mana ?? 100;
    this.hpFill.style.transform = `scaleX(${Math.max(0, Math.min(1, hp / 100))})`;
    this.manaFill.style.transform = `scaleX(${Math.max(0, Math.min(1, mana / 100))})`;
    this.nameEl.textContent = args.local?.name ?? 'Mage';
    const roomEl = this.element.querySelector<HTMLElement>('[data-room]');
    if (roomEl) roomEl.textContent = args.roomId ? args.roomId.slice(0, 6) : args.status;
    this.phaseEl.textContent = messageForPhase(args.phase, args.playerCount);
    this.voiceButton.dataset.active = String(args.voiceActive);

    const now = Date.now();
    for (const id of SPELL_IDS) {
      const button = this.spellButtons.get(id);
      if (!button || !args.local) continue;
      const readyAt = cooldownFor(args.local, id);
      const cooldown = Math.max(0, readyAt - now) / SPELLS[id].cooldownMs;
      button.style.setProperty('--cooldown', `${1 - Math.min(1, cooldown)}`);
      button.disabled = cooldown > 0 || args.local.mana < SPELLS[id].manaCost || args.phase !== 'PLAYING';
    }

    this.debugEl.textContent = [
      `net ${args.status}`,
      `phase ${args.phase}`,
      `players ${args.playerCount}`,
      `projectiles ${args.projectileCount}`,
      `session ${args.localSessionId?.slice(0, 6) ?? 'none'}`,
      `local ${args.localPlayerBound ? 'yes' : 'no'}`,
      `controls ${args.controlsEnabled ? 'yes' : 'no'}`,
      args.local ? `pos ${args.local.x.toFixed(2)},${args.local.z.toFixed(2)}` : 'pos none',
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

function cooldownFor(player: PlayerSnapshot, spellId: SpellId): number {
  switch (spellId) {
    case 'fireball':
      return player.fireballReadyAt ?? 0;
    case 'ice_bolt':
      return player.iceBoltReadyAt ?? 0;
    case 'light_burst':
      return player.lightBurstReadyAt ?? 0;
    case 'shadow_dash':
      return player.shadowDashReadyAt ?? 0;
  }
}

function messageForPhase(phase: string, count: number): string {
  if (phase === 'PLAYING') return 'Duel live';
  if (phase === 'ENDED') return 'Duel sealed';
  if (count < 2) return 'Waiting for rival';
  return 'Binding room';
}
