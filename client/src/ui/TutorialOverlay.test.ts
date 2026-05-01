import { describe, expect, it } from 'vitest';
import {
  TUTORIAL_SEEN_STORAGE_KEY,
  markTutorialSeen,
  shouldShowTutorial,
  type TutorialStorage
} from './TutorialOverlay';

function memoryStorage(initial?: string): TutorialStorage & { value: string | null } {
  return {
    value: initial ?? null,
    getItem(key: string) {
      return key === TUTORIAL_SEEN_STORAGE_KEY ? this.value : null;
    },
    setItem(key: string, value: string) {
      if (key === TUTORIAL_SEEN_STORAGE_KEY) {
        this.value = value;
      }
    }
  };
}

describe('TutorialOverlay first-run storage', () => {
  it('shows until the tutorial is skipped or completed once', () => {
    const storage = memoryStorage();

    expect(shouldShowTutorial(storage)).toBe(true);
    markTutorialSeen(storage);

    expect(storage.value).toBe('1');
    expect(shouldShowTutorial(storage)).toBe(false);
    expect(shouldShowTutorial(memoryStorage('1'))).toBe(false);
  });
});
