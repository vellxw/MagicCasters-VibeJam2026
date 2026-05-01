import type { PublishedMapChoice } from '../world/PublishedMaps';

type IntroPhase = 'WAITING' | 'SELECTING' | 'COUNTDOWN' | 'PLAYING' | 'ENDED';

export class MapIntroOverlay {
  readonly element: HTMLDivElement;

  private heroImg: HTMLImageElement;
  private titleEl: HTMLElement;
  private phaseEl: HTMLElement;
  private countdownEl: HTMLElement;
  private stripEl: HTMLElement;
  private maps: PublishedMapChoice[] = [];
  private selectedPresetId = '';
  private selectedName = '';
  private spinTimer = 0;
  private countdownTimers: number[] = [];
  private currentIndex = 0;
  private currentPhase: IntroPhase = 'WAITING';
  private audioContext: AudioContext | null = null;

  constructor(root: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'map-intro';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML = `
      <div class="map-intro__stage">
        <div class="map-intro__frame">
          <img class="map-intro__hero" alt="" draggable="false" />
          <div class="map-intro__sheen" aria-hidden="true"></div>
        </div>
        <div class="map-intro__copy">
          <span class="map-intro__phase"></span>
          <strong class="map-intro__title"></strong>
        </div>
        <div class="map-intro__strip"></div>
        <div class="map-intro__countdown" aria-live="polite"></div>
      </div>
    `;
    root.appendChild(this.element);
    this.heroImg = this.element.querySelector('.map-intro__hero')!;
    this.titleEl = this.element.querySelector('.map-intro__title')!;
    this.phaseEl = this.element.querySelector('.map-intro__phase')!;
    this.countdownEl = this.element.querySelector('.map-intro__countdown')!;
    this.stripEl = this.element.querySelector('.map-intro__strip')!;
  }

  setMaps(maps: PublishedMapChoice[]): void {
    this.maps = maps;
    this.renderStrip();
  }

  update(phase: IntroPhase, selectedPresetId: string, selectedName: string): void {
    this.selectedPresetId = selectedPresetId;
    this.selectedName = selectedName;
    if (phase === 'SELECTING') {
      this.show();
      this.element.dataset.phase = 'selecting';
      if (this.currentPhase !== 'SELECTING') {
        this.startSpin();
      }
      this.currentPhase = phase;
      return;
    }

    if (phase === 'COUNTDOWN') {
      this.show();
      this.element.dataset.phase = 'countdown';
      if (this.currentPhase !== 'COUNTDOWN') {
        this.lockSelectedMap();
        this.startCountdown();
      }
      this.currentPhase = phase;
      return;
    }

    if (phase === 'PLAYING') {
      this.stopSpin();
      this.clearCountdownTimers();
      this.element.dataset.leaving = 'true';
      this.element.dataset.phase = 'playing';
      window.setTimeout(() => this.hide(), 260);
      this.currentPhase = phase;
    }
  }

  hide(): void {
    this.stopSpin();
    this.clearCountdownTimers();
    this.element.dataset.visible = 'false';
    this.element.dataset.leaving = 'false';
    this.element.dataset.phase = 'hidden';
    this.element.setAttribute('aria-hidden', 'true');
    this.countdownEl.textContent = '';
    delete this.countdownEl.dataset.pulse;
    this.currentPhase = 'WAITING';
  }

  private show(): void {
    this.element.dataset.visible = 'true';
    this.element.dataset.leaving = 'false';
    this.element.setAttribute('aria-hidden', 'false');
  }

  private startSpin(): void {
    this.stopSpin();
    this.phaseEl.textContent = 'Selecting arena';
    this.countdownEl.textContent = '';
    this.showMap(this.maps[this.currentIndex] ?? this.fallbackMap());
    this.spinTimer = window.setInterval(() => {
      if (this.maps.length === 0) return;
      this.currentIndex = (this.currentIndex + 1) % this.maps.length;
      this.showMap(this.maps[this.currentIndex]);
    }, 155);
  }

  private stopSpin(): void {
    window.clearInterval(this.spinTimer);
    this.spinTimer = 0;
  }

  private lockSelectedMap(): void {
    this.stopSpin();
    const selected = this.maps.find((entry) => entry.presetId === this.selectedPresetId)
      ?? this.maps.find((entry) => entry.displayName === this.selectedName)
      ?? this.fallbackMap();
    this.phaseEl.textContent = 'Arena locked';
    this.showMap(selected);
    this.highlightSelected(selected.presetId);
  }

  private startCountdown(): void {
    this.clearCountdownTimers();
    [3, 2, 1].forEach((value, index) => {
      this.countdownTimers.push(window.setTimeout(() => {
        this.countdownEl.textContent = String(value);
        delete this.countdownEl.dataset.pulse;
        void this.countdownEl.offsetWidth;
        this.countdownEl.dataset.pulse = String(value);
        this.playTone();
      }, index * 1000));
    });
  }

  private clearCountdownTimers(): void {
    for (const timer of this.countdownTimers) {
      window.clearTimeout(timer);
    }
    this.countdownTimers = [];
  }

  private showMap(map: PublishedMapChoice): void {
    this.heroImg.src = map.previewUrl;
    this.titleEl.textContent = map.displayName;
    this.highlightSelected(map.presetId);
  }

  private renderStrip(): void {
    this.stripEl.innerHTML = '';
    for (const map of this.maps) {
      const thumb = document.createElement('img');
      thumb.src = map.previewUrl;
      thumb.alt = '';
      thumb.draggable = false;
      thumb.dataset.presetId = map.presetId;
      this.stripEl.appendChild(thumb);
    }
  }

  private highlightSelected(presetId: string): void {
    for (const child of Array.from(this.stripEl.children)) {
      const element = child as HTMLElement;
      element.dataset.active = String(element.dataset.presetId === presetId);
    }
  }

  private fallbackMap(): PublishedMapChoice {
    return {
      presetId: this.selectedPresetId || 'arena',
      displayName: this.selectedName || 'Selected Arena',
      previewUrl: '/map-previews/the-arcane-ritual-library.png',
      enabledModes: ['1v1', '2v2'],
      presetUrl: ''
    };
  }

  private playTone(): void {
    try {
      const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      this.audioContext ??= new AudioCtor();
      const ctx = this.audioContext;
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const duration = 0.11;
      osc.type = 'sine';
      osc.frequency.value = 440;
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio feedback is best effort; browsers can still block it.
    }
  }
}
