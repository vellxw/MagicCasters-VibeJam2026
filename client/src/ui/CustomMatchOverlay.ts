import type { BotSkill, MatchMode } from '../../../shared/types';
import type { PublishedMapChoice } from '../world/PublishedMaps';

export interface CustomCreateRequest {
  mode: MatchMode;
  partyCode: string;
  arenaPresetId: string;
  arenaName: string;
  botSkill?: BotSkill;
  minHumanPlayers?: number;
  botCount?: number;
}

export class CustomMatchOverlay {
  readonly element: HTMLDivElement;

  private codeEl: HTMLElement;
  private joinInput: HTMLInputElement;
  private modeButtons: HTMLButtonElement[] = [];
  private botButtons: HTMLButtonElement[] = [];
  private humanGateButtons: HTMLButtonElement[] = [];
  private botCountButtons: HTMLButtonElement[] = [];
  private mapRail: HTMLDivElement;
  private selectedNameEl: HTMLElement;
  private selectedMetaEl: HTMLElement;
  private createButton: HTMLButtonElement;
  private maps: PublishedMapChoice[] = [];
  private mode: MatchMode = '1v1';
  private botSkill: BotSkill | '' = '';
  private minHumanPlayers = 2;
  private botCount = 2;
  private partyCode = generatePartyCode();
  private selectedPresetId = '';

  onBack?: () => void;
  onCreate?: (request: CustomCreateRequest) => void;
  onJoin?: (partyCode: string) => void;

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'custom-match';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML = `
      <div class="custom-match__panel">
        <header class="custom-match__header">
          <button type="button" class="custom-match__back">Back</button>
          <div>
            <span class="custom-match__eyebrow">Private Portal</span>
            <h2>CUSTOM</h2>
          </div>
          <div class="custom-match__code-card">
            <span>Invite code</span>
            <strong data-party-code></strong>
          </div>
        </header>
        <main class="custom-match__body">
          <section class="custom-match__setup">
            <div class="custom-match__mode" role="tablist" aria-label="Custom match size">
              <button type="button" data-mode="1v1">1v1</button>
              <button type="button" data-mode="2v2">2v2</button>
            </div>
            <div class="custom-match__selected">
              <span>Selected map</span>
              <strong data-selected-name></strong>
              <small data-selected-meta></small>
            </div>
            <div class="custom-match__bots" role="tablist" aria-label="Bot difficulty">
              <span>Bot fill</span>
              <div>
                <button type="button" data-bot-skill="">No bot</button>
                <button type="button" data-bot-skill="novice">Novice</button>
                <button type="button" data-bot-skill="adept">Adept</button>
                <button type="button" data-bot-skill="master">Master</button>
              </div>
            </div>
            <div class="custom-match__invite-plan" data-2v2-plan>
              <span>Invite gate</span>
              <div role="tablist" aria-label="Humans before bots">
                <button type="button" data-human-gate="2">2 players</button>
                <button type="button" data-human-gate="3">3 players</button>
              </div>
            </div>
            <div class="custom-match__bot-count" data-2v2-plan>
              <span>Bot count</span>
              <div role="tablist" aria-label="Bots to fill">
                <button type="button" data-bot-count="2">Up to 2</button>
                <button type="button" data-bot-count="3">Up to 3</button>
              </div>
            </div>
            <button type="button" class="custom-match__create">Create invite room</button>
            <div class="custom-match__join">
              <label>
                <span>Join by code</span>
                <input data-join-code maxlength="8" autocomplete="off" spellcheck="false" />
              </label>
              <button type="button" data-join-button>Join</button>
            </div>
          </section>
          <section class="custom-match__maps" aria-label="Map selection">
            <div class="custom-match__map-rail"></div>
          </section>
        </main>
      </div>
    `;

    root.appendChild(this.element);
    this.codeEl = this.element.querySelector('[data-party-code]')!;
    this.joinInput = this.element.querySelector('[data-join-code]')!;
    this.mapRail = this.element.querySelector('.custom-match__map-rail')!;
    this.selectedNameEl = this.element.querySelector('[data-selected-name]')!;
    this.selectedMetaEl = this.element.querySelector('[data-selected-meta]')!;
    this.createButton = this.element.querySelector('.custom-match__create')!;
    this.modeButtons = Array.from(this.element.querySelectorAll<HTMLButtonElement>('[data-mode]'));
    this.botButtons = Array.from(this.element.querySelectorAll<HTMLButtonElement>('[data-bot-skill]'));
    this.humanGateButtons = Array.from(this.element.querySelectorAll<HTMLButtonElement>('[data-human-gate]'));
    this.botCountButtons = Array.from(this.element.querySelectorAll<HTMLButtonElement>('[data-bot-count]'));

    this.element.querySelector('.custom-match__back')?.addEventListener('click', () => this.onBack?.());
    this.createButton.addEventListener('click', () => this.create());
    this.element.querySelector('[data-join-button]')?.addEventListener('click', () => this.join());
    this.joinInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.join();
    });
    this.joinInput.addEventListener('input', () => {
      this.joinInput.value = normalizePartyCode(this.joinInput.value);
    });
    for (const button of this.modeButtons) {
      button.addEventListener('click', () => this.setMode(button.dataset.mode === '2v2' ? '2v2' : '1v1'));
    }
    for (const button of this.botButtons) {
      button.addEventListener('click', () => this.setBotSkill(toBotSkill(button.dataset.botSkill)));
    }
    for (const button of this.humanGateButtons) {
      button.addEventListener('click', () => this.setMinHumanPlayers(Number(button.dataset.humanGate)));
    }
    for (const button of this.botCountButtons) {
      button.addEventListener('click', () => this.setBotCount(Number(button.dataset.botCount)));
    }
    this.render();
  }

  setMaps(maps: PublishedMapChoice[]): void {
    this.maps = maps;
    if (!this.selectedPresetId || !this.maps.some((entry) => entry.presetId === this.selectedPresetId)) {
      this.selectedPresetId = this.maps[0]?.presetId ?? '';
    }
    this.render();
  }

  show(): void {
    this.partyCode = generatePartyCode();
    this.joinInput.value = '';
    this.render();
    this.element.dataset.visible = 'true';
    this.element.setAttribute('aria-hidden', 'false');
  }

  hide(): void {
    this.element.dataset.visible = 'false';
    this.element.setAttribute('aria-hidden', 'true');
  }

  private setMode(mode: MatchMode): void {
    this.mode = mode;
    this.render();
  }

  private setBotSkill(skill: BotSkill | ''): void {
    this.botSkill = skill;
    this.render();
  }

  private setMinHumanPlayers(value: number): void {
    this.minHumanPlayers = value === 3 ? 3 : 2;
    this.render();
  }

  private setBotCount(value: number): void {
    this.botCount = value === 3 ? 3 : 2;
    this.render();
  }

  private create(): void {
    const selected = this.selectedMap();
    if (!selected) return;
    this.onCreate?.({
      mode: this.mode,
      partyCode: this.partyCode,
      arenaPresetId: selected.presetId,
      arenaName: selected.displayName,
      ...(this.botSkill ? { botSkill: this.botSkill } : {}),
      ...(this.mode === '2v2' && this.botSkill ? {
        minHumanPlayers: this.minHumanPlayers,
        botCount: this.botCount
      } : {})
    });
  }

  private join(): void {
    const code = normalizePartyCode(this.joinInput.value);
    if (code.length < 4) {
      this.joinInput.focus();
      return;
    }
    this.onJoin?.(code);
  }

  private render(): void {
    this.codeEl.textContent = this.partyCode;
    for (const button of this.modeButtons) {
      const active = button.dataset.mode === this.mode;
      button.dataset.active = String(active);
      button.setAttribute('aria-selected', String(active));
    }
    for (const button of this.botButtons) {
      const active = toBotSkill(button.dataset.botSkill) === this.botSkill;
      button.dataset.active = String(active);
      button.setAttribute('aria-selected', String(active));
    }
    for (const button of this.humanGateButtons) {
      const active = Number(button.dataset.humanGate) === this.minHumanPlayers;
      button.dataset.active = String(active);
      button.setAttribute('aria-selected', String(active));
    }
    for (const button of this.botCountButtons) {
      const active = Number(button.dataset.botCount) === this.botCount;
      button.dataset.active = String(active);
      button.setAttribute('aria-selected', String(active));
    }
    this.element.dataset.mode = this.mode;
    this.element.dataset.botFill = String(Boolean(this.botSkill));

    this.mapRail.innerHTML = '';
    for (const map of this.maps) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'custom-match__map-card';
      button.dataset.active = String(map.presetId === this.selectedPresetId);
      button.innerHTML = `
        <img src="${map.previewUrl}" alt="" draggable="false" />
        <span>${map.displayName}</span>
      `;
      button.addEventListener('click', () => {
        this.selectedPresetId = map.presetId;
        this.render();
      });
      this.mapRail.appendChild(button);
    }

    const selected = this.selectedMap();
    const botLabel = this.mode === '2v2' && this.botSkill
      ? `${capitalize(this.botSkill)} bots after ${this.minHumanPlayers} humans`
      : this.botSkill ? `${capitalize(this.botSkill)} bot` : 'bot after 60s';
    this.selectedNameEl.textContent = selected?.displayName ?? 'Loading maps';
    this.selectedMetaEl.textContent = selected
      ? `${this.mode} invite room · ${this.partyCode} · ${botLabel}`
      : 'Map catalog unavailable';
    this.createButton.disabled = !selected;
  }

  private selectedMap(): PublishedMapChoice | null {
    return this.maps.find((entry) => entry.presetId === this.selectedPresetId)
      ?? this.maps[0]
      ?? null;
  }
}

function generatePartyCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function normalizePartyCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function toBotSkill(value: string | undefined): BotSkill | '' {
  return value === 'novice' || value === 'adept' || value === 'master' ? value : '';
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
