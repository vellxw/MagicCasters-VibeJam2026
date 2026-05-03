import { SPELLS, getClassSpellVariant, getSpellIdsForClass } from '../../../shared/spells';
import { CLASSES, type CharacterClass } from '../../../shared/classes';
import type { SpellId } from '../../../shared/spells';

interface CharacterSelectContext {
  modeLabel: string;
  arenaLabel: string;
}

interface ClassStat {
  label: string;
  value: string;
  meter: number;
}

interface CharacterProfile {
  callsign: string;
  role: string;
  affinity: string;
  quote: string;
  stats: ClassStat[];
}

type AuthEndpoint = 'login' | 'register';

interface AuthSessionResponse {
  mmr: number;
  token?: string;
  username: string;
}

interface AuthErrorResponse {
  error?: string;
}

function getSafeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isLocalDevHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

function resolveAuthBaseUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://localhost:3001';
  }

  const { hostname, origin, port, protocol } = window.location;
  if ((port === '5173' || port === '5174') && isLocalDevHost(hostname)) {
    return `${protocol}//${hostname}:3001`;
  }

  return origin;
}

function parseAuthSession(value: unknown): AuthSessionResponse | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.username !== 'string' || typeof candidate.mmr !== 'number') {
    return null;
  }

  return {
    mmr: candidate.mmr,
    token: typeof candidate.token === 'string' ? candidate.token : undefined,
    username: candidate.username
  };
}

function parseAuthError(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as AuthErrorResponse;
  return typeof candidate.error === 'string' ? candidate.error : null;
}

function requestUiFrame(callback: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(() => callback(Date.now()), 16) as unknown as number;
}

function cancelUiFrame(id: number): void {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(id);
    return;
  }
  globalThis.clearTimeout(id);
}

const CLASS_PROFILES: Record<CharacterClass, CharacterProfile> = {
  arcanist: {
    callsign: 'NOX-13',
    role: 'Shadow marksman',
    affinity: 'Umbral chain',
    quote: 'One mark. One opening. The duel ends in the dark.',
    stats: [
      { label: 'Damage Output', value: '920', meter: 11 },
      { label: 'Combo Pressure', value: '880', meter: 10 },
      { label: 'Mobility', value: '720', meter: 8 },
      { label: 'Durability', value: '430', meter: 5 },
      { label: 'Difficulty', value: 'Hard', meter: 10 }
    ]
  },
  divine: {
    callsign: 'LUX-24',
    role: 'Celestial controller',
    affinity: 'Judgment field',
    quote: 'Hold the line, bend the light, punish every mistake.',
    stats: [
      { label: 'Damage Output', value: '780', meter: 9 },
      { label: 'Combo Pressure', value: '700', meter: 8 },
      { label: 'Mobility', value: '560', meter: 6 },
      { label: 'Durability', value: '820', meter: 9 },
      { label: 'Difficulty', value: 'Medium', meter: 7 }
    ]
  }
};

export class CharacterSelectOverlay {
  readonly element: HTMLDivElement;
  readonly previewArea: HTMLDivElement;

  private backButton: HTMLButtonElement;
  private previousClassButton: HTMLButtonElement;
  private nextClassButton: HTMLButtonElement;
  private tabArcanist: HTMLButtonElement;
  private tabDivine: HTMLButtonElement;
  private spellList: HTMLDivElement;
  private statList: HTMLDivElement;
  private confirmButton: HTMLButtonElement;
  private classDescription: HTMLParagraphElement;
  private classInfoTitle: HTMLHeadingElement;
  private classQuote: HTMLParagraphElement;
  private classRole: HTMLSpanElement;
  private classTitle: HTMLHeadingElement;
  private modeLabel: HTMLSpanElement;
  private arenaLabel: HTMLElement;
  private profileClass: HTMLElement;
  private confirmClass: HTMLElement;

  private selectedClass: CharacterClass = 'arcanist';
  private selectedSpell: SpellId | null = null;
  private quoteTimeoutId: number | null = null;
  private statAnimationIds: number[] = [];

  onBack?: () => void;
  onClassSelect?: (characterClass: CharacterClass) => void;
  onConfirm?: (characterClass: CharacterClass) => void;
  onSpellHover?: (spellId: SpellId | null) => void;

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'character-select';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML = `
      <div class="character-select__frame">
        <aside class="character-select__side character-select__side--classes">
          <div class="character-select__brand">
            <span class="character-select__brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L22 20H2L12 2Z"></path></svg>
            </span>
            <div class="character-select__heading">
              <h2 class="character-select__title">MAGE ROSTER</h2>
              <span class="character-select__eyebrow">SELECT YOUR CASTER</span>
            </div>
          </div>
          <div class="character-select__tabs" role="tablist" aria-label="Mage classes">
            <button type="button" role="tab" data-class="arcanist" class="character-select__tab character-select__roster-card character-select__tab--arcanist">
              <span class="character-select__portrait character-select__portrait--arcanist" aria-hidden="true">
                <span>A</span>
              </span>
              <span class="character-select__roster-copy">
                <span class="character-select__tab-name">Arcanist</span>
                <span class="character-select__tab-sub">Shadow marks and burst combos</span>
              </span>
              <div class="character-select__tab-status">SELECTED</div>
            </button>
            <button type="button" role="tab" data-class="divine" class="character-select__tab character-select__roster-card character-select__tab--divine">
              <span class="character-select__portrait character-select__portrait--divine" aria-hidden="true">
                <span>D</span>
              </span>
              <span class="character-select__roster-copy">
                <span class="character-select__tab-name">Divine</span>
                <span class="character-select__tab-sub">Light control and punishment</span>
              </span>
              <div class="character-select__tab-status">SELECTED</div>
            </button>
          </div>
          <div class="character-select__class-info">
            <span class="character-select__section-label">SCOUT FILE</span>
            <h3 class="character-select__class-title"></h3>
            <p class="character-select__class-desc"></p>
          </div>
          <div class="character-select__roster-footer">
            <span>Class Archive</span>
            <strong>02/02</strong>
          </div>
        </aside>
        <main class="character-select__stage">
          <button type="button" class="character-select__back" aria-label="Back to lobby">X</button>
          <div class="character-select__identity">
            <div class="character-select__identity-header">
              <span class="character-select__class-sigil" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>
              </span>
              <h3 class="character-select__stage-title"></h3>
            </div>
            <div>
              <span class="character-select__class-role"></span>
              <p class="character-select__quote"></p>
            </div>
          </div>
          <button type="button" class="character-select__nav character-select__nav--previous" data-select-nav="previous" aria-label="Previous caster">&lt;</button>
          <div class="character-select__preview-area">
            <div class="character-select__hint">Drag to rotate</div>
          </div>
          <button type="button" class="character-select__nav character-select__nav--next" data-select-nav="next" aria-label="Next caster">&gt;</button>
          <div class="character-select__toolbar">
            <button type="button" class="character-select__icon-btn" aria-label="Profile">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </button>
            <button type="button" class="character-select__icon-btn" aria-label="Lore">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            </button>
            <button type="button" class="character-select__confirm">
              <span class="character-select__confirm-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v8"></path><path d="M8 12h8"></path></svg>
              </span>
              <span>CONFIRM</span>
              <small></small>
            </button>
            <button type="button" class="character-select__icon-btn" aria-label="Messages">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
            </button>
            <button type="button" class="character-select__icon-btn" aria-label="Customize">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r=".5"></circle><circle cx="17.5" cy="10.5" r=".5"></circle><circle cx="8.5" cy="7.5" r=".5"></circle><circle cx="6.5" cy="12.5" r=".5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>
            </button>
          </div>
        </main>
        <aside class="character-select__side character-select__side--loadout">
          <div class="character-select__card character-select__profile">
            <div class="character-select__player-avatar" aria-hidden="true">K</div>
            <div>
              <strong>Kairos</strong>
              <span class="character-select__profile-class"></span>
            </div>
            <div class="character-select__context">
              <span class="character-select__mode"></span>
              <strong class="character-select__arena"></strong>
            </div>
          </div>
          <div class="character-select__card character-select__loadout-panel">
            <div class="character-select__stats">
              <div class="character-select__panel-head">
                <span class="character-select__section-label">UNIT STATS</span>
              </div>
              <div class="character-select__stat-list"></div>
            </div>
            <div class="character-select__spells">
              <div class="character-select__loadout-head">
                <span class="character-select__section-label">ABILITIES</span>
                <strong>4 abilities</strong>
              </div>
              <div class="character-select__spell-list"></div>
            </div>
          </div>
        </aside>
      </div>

      <!-- Profile Registration Modal -->
      <div class="character-select__modal" id="profile-modal" aria-hidden="true" data-visible="false">
        <div class="character-select__modal-backdrop" data-close-modal></div>
        <div class="character-select__modal-content">
          <button type="button" class="character-select__modal-close" data-close-modal aria-label="Close">&times;</button>
          <h2 class="character-select__modal-title">Perfil del Duelista</h2>

          <!-- Guest State -->
          <div id="auth-guest-state">
            <p class="character-select__modal-desc">
              Crea una cuenta para guardar tus estadísticas, rango y progreso.
              <br/><strong>¡Es totalmente opcional!</strong>
            </p>
            <div class="character-select__auth-error" id="auth-error"></div>
            <div class="character-select__auth-form">
              <input type="text" id="auth-username" class="character-select__input" placeholder="Nombre de usuario" />
              <input type="password" id="auth-password" class="character-select__input" placeholder="Contraseña" />
            </div>
            <div class="character-select__modal-actions">
              <button type="button" class="character-select__modal-btn character-select__btn--primary" id="btn-login">Iniciar Sesión</button>
              <button type="button" class="character-select__modal-btn character-select__btn--secondary" id="btn-register">Crear Cuenta</button>
            </div>
          </div>

          <!-- Logged In State -->
          <div id="auth-logged-in-state" style="display: none;">
            <div class="character-select__logged-in-state">
              <span class="character-select__logged-in-user" id="logged-in-username"></span>
              <span style="color: rgba(224,233,241,0.7)">MMR: <strong id="logged-in-mmr"></strong></span>
            </div>
            <div class="character-select__modal-actions">
              <button type="button" class="character-select__modal-btn character-select__btn--secondary" id="btn-logout">Cerrar Sesión</button>
            </div>
          </div>

        </div>
      </div>
    `;

    root.appendChild(this.element);

    this.backButton = this.element.querySelector('.character-select__back')!;
    this.previousClassButton = this.element.querySelector('[data-select-nav="previous"]')!;
    this.nextClassButton = this.element.querySelector('[data-select-nav="next"]')!;
    this.previewArea = this.element.querySelector('.character-select__preview-area')!;
    this.tabArcanist = this.element.querySelector('[data-class="arcanist"]')!;
    this.tabDivine = this.element.querySelector('[data-class="divine"]')!;
    this.spellList = this.element.querySelector('.character-select__spell-list')!;
    this.statList = this.element.querySelector('.character-select__stat-list')!;
    this.confirmButton = this.element.querySelector('.character-select__confirm')!;
    this.classDescription = this.element.querySelector('.character-select__class-desc')!;
    this.classInfoTitle = this.element.querySelector('.character-select__class-title')!;
    this.classQuote = this.element.querySelector('.character-select__quote')!;
    this.classRole = this.element.querySelector('.character-select__class-role')!;
    this.classTitle = this.element.querySelector('.character-select__stage-title')!;
    this.modeLabel = this.element.querySelector('.character-select__mode')!;
    this.arenaLabel = this.element.querySelector('.character-select__arena')!;
    this.profileClass = this.element.querySelector('.character-select__profile-class')!;
    this.confirmClass = this.element.querySelector('.character-select__confirm small')!;

    this.backButton.addEventListener('click', () => this.onBack?.());
    this.previousClassButton.addEventListener('click', () => this.selectClass(this.getAdjacentClass()));
    this.nextClassButton.addEventListener('click', () => this.selectClass(this.getAdjacentClass()));
    this.tabArcanist.addEventListener('click', () => this.selectClass('arcanist'));
    this.tabDivine.addEventListener('click', () => this.selectClass('divine'));
    this.confirmButton.addEventListener('click', () => this.onConfirm?.(this.selectedClass));

    // Toolbar buttons
    const btnProfile = this.element.querySelector('button[aria-label="Profile"]');
    const btnLore = this.element.querySelector('button[aria-label="Lore"]');
    const btnMessages = this.element.querySelector('button[aria-label="Messages"]');
    const btnCustomize = this.element.querySelector('button[aria-label="Customize"]');
    const profileModal = this.element.querySelector('#profile-modal') as HTMLElement;
    const closeModalBtns = this.element.querySelectorAll('[data-close-modal]');

    // Modal Events
    const openModal = () => {
      if (profileModal) {
        profileModal.dataset.visible = 'true';
        profileModal.setAttribute('aria-hidden', 'false');
      }
    };
    const closeModal = () => {
      if (profileModal) {
        profileModal.dataset.visible = 'false';
        profileModal.setAttribute('aria-hidden', 'true');
      }
    };

    btnProfile?.addEventListener('click', openModal);
    closeModalBtns.forEach(btn => btn.addEventListener('click', closeModal));

    // Auth Logic
    const guestState = this.element.querySelector('#auth-guest-state') as HTMLElement;
    const loggedInState = this.element.querySelector('#auth-logged-in-state') as HTMLElement;
    const usernameInput = this.element.querySelector('#auth-username') as HTMLInputElement;
    const passwordInput = this.element.querySelector('#auth-password') as HTMLInputElement;
    const errorDisplay = this.element.querySelector('#auth-error') as HTMLElement;
    const btnLogin = this.element.querySelector('#btn-login') as HTMLButtonElement | null;
    const btnRegister = this.element.querySelector('#btn-register') as HTMLButtonElement | null;
    const btnLogout = this.element.querySelector('#btn-logout');
    const displayUsername = this.element.querySelector('#logged-in-username') as HTMLElement;
    const displayMmr = this.element.querySelector('#logged-in-mmr') as HTMLElement;
    const authBaseUrl = resolveAuthBaseUrl();
    const storage = getSafeStorage();

    const clearStoredSession = () => {
      storage?.removeItem('vibejam_token');
      storage?.removeItem('vibejam_username');
      storage?.removeItem('vibejam_mmr');
    };

    const storeSession = (session: AuthSessionResponse, token?: string) => {
      if (!storage) {
        return;
      }
      if (token) {
        storage.setItem('vibejam_token', token);
      }
      storage.setItem('vibejam_username', session.username);
      storage.setItem('vibejam_mmr', String(session.mmr));
    };

    const showGuestState = (message = '') => {
      guestState.style.display = 'block';
      loggedInState.style.display = 'none';
      usernameInput.value = '';
      passwordInput.value = '';
      errorDisplay.textContent = message;
    };

    const showLoggedInState = (session: AuthSessionResponse) => {
      guestState.style.display = 'none';
      loggedInState.style.display = 'block';
      displayUsername.textContent = `Bienvenido, ${session.username}`;
      displayMmr.textContent = String(session.mmr);
      errorDisplay.textContent = '';
    };

    const setAuthLoading = (loading: boolean) => {
      btnLogin?.toggleAttribute('disabled', loading);
      btnRegister?.toggleAttribute('disabled', loading);
      if (loading) {
        errorDisplay.textContent = 'Validando sesión...';
      }
    };

    const verifyStoredSession = async () => {
      const token = storage?.getItem('vibejam_token');
      if (!token) {
        showGuestState();
        return;
      }

      setAuthLoading(true);
      try {
        const res = await fetch(`${authBaseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data: unknown = await res.json();
        const session = res.ok ? parseAuthSession(data) : null;
        if (!session) {
          clearStoredSession();
          showGuestState(parseAuthError(data) ?? 'Sesión expirada');
          return;
        }

        storeSession(session);
        showLoggedInState(session);
      } catch {
        showGuestState('No pudimos validar tu sesión');
      } finally {
        setAuthLoading(false);
      }
    };

    void verifyStoredSession();

    const doAuth = async (endpoint: AuthEndpoint) => {
      errorDisplay.textContent = '';
      const username = usernameInput.value.trim();
      const password = passwordInput.value;
      if (!username || !password) {
        errorDisplay.textContent = 'Completa ambos campos';
        return;
      }

      setAuthLoading(true);
      try {
        const res = await fetch(`${authBaseUrl}/api/auth/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data: unknown = await res.json();
        const session = res.ok ? parseAuthSession(data) : null;
        if (!res.ok) {
          errorDisplay.textContent = parseAuthError(data) ?? 'Error de autenticación';
          return;
        }

        if (!session?.token) {
          errorDisplay.textContent = 'La respuesta de sesión no fue válida';
          return;
        }

        storeSession(session, session.token);
        showLoggedInState(session);
        showToast(endpoint === 'register' ? 'Cuenta creada' : 'Sesión iniciada');
      } catch {
        errorDisplay.textContent = 'Error de conexión';
      } finally {
        setAuthLoading(false);
      }
    };

    btnLogin?.addEventListener('click', () => doAuth('login'));
    btnRegister?.addEventListener('click', () => doAuth('register'));
    btnLogout?.addEventListener('click', () => {
      clearStoredSession();
      showGuestState();
    });

    // Toasts for 'Coming soon'
    const showToast = (msg: string) => {
      const toast = document.createElement('div');
      toast.className = 'character-select__toast';
      toast.textContent = msg;
      this.element.appendChild(toast);

      requestUiFrame(() => toast.classList.add('visible'));

      setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    };

    btnLore?.addEventListener('click', () => showToast('Grimorio: Próximamente'));
    btnMessages?.addEventListener('click', () => showToast('Mensajes: Próximamente'));
    btnCustomize?.addEventListener('click', () => showToast('Skins y Cosméticos: Próximamente'));

    this.selectClass('arcanist');
  }

  show(context?: CharacterSelectContext): void {
    if (context) {
      this.modeLabel.textContent = context.modeLabel;
      this.arenaLabel.textContent = context.arenaLabel;
    }
    this.element.dataset.visible = 'true';
    this.element.setAttribute('aria-hidden', 'false');
  }

  hide(): void {
    this.element.dataset.visible = 'false';
    this.element.setAttribute('aria-hidden', 'true');
    this.selectedSpell = null;
    this.cancelAnimations();
    for (const entry of Array.from(this.spellList.children)) {
      (entry as HTMLElement).dataset.hovered = 'false';
    }
    this.onSpellHover?.(null);
  }

  private cancelAnimations(): void {
    if (this.quoteTimeoutId) {
      clearTimeout(this.quoteTimeoutId);
      this.quoteTimeoutId = null;
    }
    for (const id of this.statAnimationIds) {
      cancelUiFrame(id);
    }
    this.statAnimationIds = [];
  }

  private animateQuote(text: string): void {
    if (this.quoteTimeoutId) {
      clearTimeout(this.quoteTimeoutId);
      this.quoteTimeoutId = null;
    }
    this.classQuote.textContent = '';
    let i = 0;
    const typeChar = () => {
      if (i < text.length) {
        this.classQuote.textContent += text.charAt(i);
        i++;
        this.quoteTimeoutId = globalThis.setTimeout(typeChar, 20) as unknown as number;
      } else {
        this.quoteTimeoutId = null;
      }
    };
    typeChar();
  }

  private selectClass(characterClass: CharacterClass): void {
    this.cancelAnimations();
    this.selectedSpell = null;
    this.onSpellHover?.(null);
    this.selectedClass = characterClass;
    this.onClassSelect?.(characterClass);

    const cls = CLASSES[characterClass];
    const profile = CLASS_PROFILES[characterClass];
    const color = `#${cls.themeColor.toString(16).padStart(6, '0')}`;

    this.element.dataset.class = characterClass;
    this.element.style.setProperty('--character-class-color', color);
    this.tabArcanist.dataset.active = String(characterClass === 'arcanist');
    this.tabDivine.dataset.active = String(characterClass === 'divine');
    this.tabArcanist.setAttribute('aria-selected', String(characterClass === 'arcanist'));
    this.tabDivine.setAttribute('aria-selected', String(characterClass === 'divine'));

    this.classTitle.textContent = profile.callsign;
    this.classInfoTitle.textContent = cls.title;
    this.classRole.textContent = profile.role;
    this.animateQuote(`"${profile.quote}"`);
    this.classDescription.textContent = cls.description;
    this.profileClass.textContent = `${profile.callsign} / ${profile.affinity}`;
    this.confirmClass.textContent = cls.name;

    this.renderStats(profile);
    this.renderSpells(characterClass);
  }

  private getAdjacentClass(): CharacterClass {
    return this.selectedClass === 'arcanist' ? 'divine' : 'arcanist';
  }

  private renderStats(profile: CharacterProfile): void {
    this.statList.innerHTML = '';

    for (const stat of profile.stats) {
      const row = document.createElement('div');
      row.className = 'character-select__stat-row';
      const iconSvg = this.getStatIcon(stat.label);
      row.innerHTML = `
        <div class="character-select__stat-head">
          <span class="character-select__stat-icon">${iconSvg}</span>
          <span class="character-select__stat-label">${stat.label}</span>
          <strong class="character-select__stat-value"></strong>
        </div>
        <div class="character-select__stat-meter" aria-hidden="true">
          ${this.renderStatBars(stat.meter)}
        </div>
      `;
      this.statList.appendChild(row);
      const valueEl = row.querySelector('.character-select__stat-value') as HTMLElement;
      this.animateStatNumber(valueEl, stat.value);
    }
  }

  private animateStatNumber(element: HTMLElement, finalValueStr: string): void {
    const finalValue = parseInt(finalValueStr, 10);
    if (isNaN(finalValue)) {
      element.textContent = finalValueStr;
      return;
    }

    const duration = 600;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const easeProgress = progress * (2 - progress);
      const currentValue = Math.floor(easeProgress * finalValue);

      element.textContent = currentValue.toString();

      if (progress < 1) {
        const id = requestUiFrame(animate);
        this.statAnimationIds.push(id);
      } else {
        element.textContent = finalValueStr;
      }
    };

    const id = requestUiFrame(animate);
    this.statAnimationIds.push(id);
  }

  private getStatIcon(label: string): string {
    const l = label.toLowerCase();
    if (l.includes('damage') || l.includes('output')) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"></path><path d="M13 19l6-6"></path><path d="M16 16l4 4"></path><path d="M19 21l2-2"></path><path d="M14.5 6.5L18 3h3v3l-3.5 3.5"></path></svg>';
    if (l.includes('combo') || l.includes('utility')) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>';
    if (l.includes('mobility')) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6"></path><path d="M4 10h10"></path><path d="M4 6h14"></path><path d="M18 10l3 3-3 3"></path></svg>';
    if (l.includes('durability')) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>';
    if (l.includes('difficulty')) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  }

  private renderStatBars(activeCount: number): string {
    const clamped = Math.max(0, Math.min(12, activeCount));
    return Array.from({ length: 12 }, (_, index) =>
      `<span data-active="${String(index < clamped)}" style="--index: ${index};"></span>`
    ).join('');
  }

  private renderSpells(characterClass: CharacterClass): void {
    this.spellList.innerHTML = '';

    for (const spellId of getSpellIdsForClass(characterClass)) {
      const base = SPELLS[spellId];
      const variant = getClassSpellVariant(spellId, characterClass);
      const spellColor = `#${variant.color.toString(16).padStart(6, '0')}`;

      const card = document.createElement('div');
      card.className = 'character-select__spell-card';
      card.dataset.spellId = spellId;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.style.setProperty('--spell-color', spellColor);
      card.innerHTML = `
        <div class="character-select__spell-key">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        </div>
        <div class="character-select__spell-info">
          <div class="character-select__spell-name">${variant.label}</div>
          <div class="character-select__spell-meta">
            <span>${base.damage} dmg</span>
            <span>${base.manaCost} mana</span>
          </div>
          <div class="character-select__spell-desc">${variant.description}</div>
        </div>
      `;

      const previewSpell = () => {
        this.selectedSpell = spellId;
        for (const entry of Array.from(this.spellList.children)) {
          (entry as HTMLElement).dataset.hovered = 'false';
        }
        this.onSpellHover?.(spellId);
        card.dataset.hovered = 'true';
      };
      const clearPreview = () => {
        if (this.selectedSpell === spellId) {
          this.selectedSpell = null;
          this.onSpellHover?.(null);
        }
        card.dataset.hovered = 'false';
      };

      card.addEventListener('mouseenter', previewSpell);
      card.addEventListener('mouseleave', clearPreview);
      card.addEventListener('focus', previewSpell);
      card.addEventListener('blur', clearPreview);
      card.addEventListener('click', previewSpell);

      this.spellList.appendChild(card);
    }
  }
}
