import { spellIdFromClassIncantation, type SpellId } from '../../../shared/spells';
import type { CharacterClass } from '../../../shared/classes';

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export class VoiceCommandManager {
  active = false;
  supported = false;
  transcript = '';
  onSpell?: (spellId: SpellId, raw: string) => void;
  onStatus?: (message: string) => void;

  private recognition: SpeechRecognitionLike | null = null;
  private characterClass: CharacterClass = 'arcanist';

  constructor() {
    this.supported = Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  toggle(): void {
    if (this.active) this.stop();
    else this.start();
  }

  setCharacterClass(characterClass: CharacterClass): void {
    this.characterClass = characterClass;
  }

  start(): void {
    if (!this.supported) {
      this.onStatus?.('Voice unavailable');
      return;
    }

    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition: SpeechRecognitionLike = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      const raw = result?.[0]?.transcript ?? '';
      this.transcript = raw;
      if (!result?.isFinal) return;
      const spell = spellIdFromClassIncantation(this.characterClass, raw);
      if (spell) this.onSpell?.(spell, raw);
    };
    recognition.onerror = (event: any) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      this.onStatus?.(String(event.error ?? 'Voice error'));
    };
    recognition.onend = () => {
      if (this.active) {
        try {
          recognition.start();
        } catch {
          this.active = false;
        }
      }
    };

    this.recognition = recognition;
    this.active = true;
    this.onStatus?.('Voice on');
    recognition.start();
  }

  stop(): void {
    this.active = false;
    this.onStatus?.('Voice off');
    try {
      this.recognition?.stop();
    } catch {
      // Browser speech APIs can throw when already stopped.
    }
    this.recognition = null;
  }
}
