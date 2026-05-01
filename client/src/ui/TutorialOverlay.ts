export const TUTORIAL_SEEN_STORAGE_KEY = 'mc_tutorial_seen_v1';

export interface TutorialStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

interface TutorialStep {
  title: string;
  body: string;
  detail: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Enter the throne lobby',
    body: 'Walk to a portal and press E to choose a duel. The custom portal creates private invite rooms.',
    detail: 'Public portals queue 1v1 or 2v2. Custom rooms give you an invite code.'
  },
  {
    title: 'Choose your mage',
    body: 'Pick Arcanist for marks and combos, or Divine for control and punishment.',
    detail: 'Hover each spell to preview its cast effect, then confirm to queue.'
  },
  {
    title: 'Move and aim',
    body: 'Use WASD to move, mouse to aim, Space to jump, and Space again while airborne to dash.',
    detail: 'On mobile, use the left drag zone for movement and the right side for camera, jump, and dash.'
  },
  {
    title: 'Cast spells',
    body: 'Default attacks are LMB for spell 1, RMB for spell 2, Q for spell 3, and E for spell 4.',
    detail: 'The 1-4 keys still cast each slot. Voice commands and spell buttons also stay available.'
  },
  {
    title: 'Win the duel',
    body: 'Watch mana, cooldowns, status effects, and your team color. A team wins when every opponent is down.',
    detail: 'After a match you can rematch, pick a different public match, or return to the lobby.'
  },
  {
    title: 'Custom rooms',
    body: 'For custom 2v2, choose how many humans should arrive before bots fill the remaining slots.',
    detail: 'Invited players appear in the waiting screen before the match starts, so the room can breathe.'
  }
];

export function shouldShowTutorial(storage = browserStorage()): boolean {
  return storage?.getItem(TUTORIAL_SEEN_STORAGE_KEY) !== '1';
}

export function markTutorialSeen(storage = browserStorage()): void {
  storage?.setItem(TUTORIAL_SEEN_STORAGE_KEY, '1');
}

export class TutorialOverlay {
  readonly element: HTMLDivElement;

  private titleEl: HTMLElement;
  private bodyEl: HTMLElement;
  private detailEl: HTMLElement;
  private progressEl: HTMLElement;
  private nextButton: HTMLButtonElement;
  private skipButton: HTMLButtonElement;
  private index = 0;
  private onDone: (() => void) | null = null;
  private keyHandler = (event: KeyboardEvent) => {
    if (this.element.dataset.visible !== 'true') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.finish();
    }
  };

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'tutorial-overlay';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML = `
      <div class="tutorial-overlay__panel" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
        <div class="tutorial-overlay__progress" data-tutorial-progress></div>
        <h2 id="tutorial-title" data-tutorial-title></h2>
        <p data-tutorial-body></p>
        <small data-tutorial-detail></small>
        <div class="tutorial-overlay__actions">
          <button type="button" data-tutorial-skip>Skip</button>
          <button type="button" data-tutorial-next>Next</button>
        </div>
      </div>
    `;

    root.appendChild(this.element);
    this.titleEl = this.element.querySelector('[data-tutorial-title]')!;
    this.bodyEl = this.element.querySelector('[data-tutorial-body]')!;
    this.detailEl = this.element.querySelector('[data-tutorial-detail]')!;
    this.progressEl = this.element.querySelector('[data-tutorial-progress]')!;
    this.nextButton = this.element.querySelector('[data-tutorial-next]')!;
    this.skipButton = this.element.querySelector('[data-tutorial-skip]')!;

    this.nextButton.addEventListener('click', () => this.next());
    this.skipButton.addEventListener('click', () => this.finish());
    window.addEventListener('keydown', this.keyHandler, true);
    this.render();
  }

  show(onDone: () => void): void {
    this.onDone = onDone;
    this.index = 0;
    this.render();
    this.element.dataset.visible = 'true';
    this.element.setAttribute('aria-hidden', 'false');
  }

  hide(): void {
    this.element.dataset.visible = 'false';
    this.element.setAttribute('aria-hidden', 'true');
  }

  private next(): void {
    if (this.index >= TUTORIAL_STEPS.length - 1) {
      this.finish();
      return;
    }
    this.index++;
    this.render();
  }

  private finish(): void {
    markTutorialSeen();
    this.hide();
    const done = this.onDone;
    this.onDone = null;
    done?.();
  }

  private render(): void {
    const step = TUTORIAL_STEPS[this.index] ?? TUTORIAL_STEPS[0];
    this.titleEl.textContent = step.title;
    this.bodyEl.textContent = step.body;
    this.detailEl.textContent = step.detail;
    this.progressEl.textContent = `${this.index + 1} / ${TUTORIAL_STEPS.length}`;
    this.nextButton.textContent = this.index >= TUTORIAL_STEPS.length - 1 ? 'Enter Lobby' : 'Next';
  }
}

function browserStorage(): TutorialStorage | null {
  return typeof window !== 'undefined' ? window.localStorage : null;
}
