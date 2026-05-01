import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapIntroOverlay } from './MapIntroOverlay';

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  readonly classNodes = new Map<string, FakeElement>();
  className = '';
  textContent = '';
  src = '';
  alt = '';
  draggable = false;

  set innerHTML(_value: string) {
    this.classNodes.clear();
    for (const className of [
      'map-intro__hero',
      'map-intro__title',
      'map-intro__phase',
      'map-intro__countdown',
      'map-intro__strip'
    ]) {
      const node = new FakeElement();
      node.className = className;
      this.classNodes.set(`.${className}`, node);
    }
  }

  get innerHTML(): string {
    return '';
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  querySelector(selector: string): FakeElement | null {
    return this.classNodes.get(selector) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
}

describe('MapIntroOverlay countdown audio', () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const oscillatorStarts: Array<{ type: OscillatorType; frequency: number; stopTime: number }> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    oscillatorStarts.length = 0;

    const AudioContextMock = vi.fn(() => ({
      currentTime: 0,
      destination: {},
      state: 'running',
      resume: vi.fn(),
      createOscillator: vi.fn(() => {
        const oscillator = {
          type: 'square' as OscillatorType,
          frequency: { value: 0 },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn((time: number) => {
            oscillatorStarts.push({
              type: oscillator.type,
              frequency: oscillator.frequency.value,
              stopTime: time
            });
          })
        };
        return oscillator;
      }),
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn()
        },
        connect: vi.fn()
      }))
    }));

    globalThis.document = {
      createElement: vi.fn(() => new FakeElement())
    } as unknown as Document;

    globalThis.window = {
      AudioContext: AudioContextMock,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout
    } as unknown as Window & typeof globalThis;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  it('only plays one soft sine beep per countdown number', () => {
    const root = new FakeElement();
    const overlay = new MapIntroOverlay(root as unknown as HTMLElement);
    overlay.setMaps([{
      presetId: 'arena-one',
      displayName: 'Arena One',
      previewUrl: '/map-previews/arena-one.png',
      presetUrl: '/arena-presets/arena-one.json',
      enabledModes: ['1v1', '2v2']
    }]);

    overlay.update('SELECTING', 'arena-one', 'Arena One');
    vi.advanceTimersByTime(500);
    expect(oscillatorStarts).toHaveLength(0);

    overlay.update('COUNTDOWN', 'arena-one', 'Arena One');
    vi.advanceTimersByTime(0);
    expect(oscillatorStarts).toEqual([{ type: 'sine', frequency: 440, stopTime: 0.11 }]);

    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    expect(oscillatorStarts).toEqual([
      { type: 'sine', frequency: 440, stopTime: 0.11 },
      { type: 'sine', frequency: 440, stopTime: 0.11 },
      { type: 'sine', frequency: 440, stopTime: 0.11 }
    ]);

    overlay.update('PLAYING', 'arena-one', 'Arena One');
    vi.advanceTimersByTime(500);
    expect(oscillatorStarts).toHaveLength(3);
  });
});
