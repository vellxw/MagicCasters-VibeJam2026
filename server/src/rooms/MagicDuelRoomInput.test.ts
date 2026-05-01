import { describe, expect, it } from 'vitest';
import { emptyInput, normalizeInput } from './MagicDuelRoom';

describe('MagicDuelRoom input normalization', () => {
  it('does not invent a default rotation before the client sends one', () => {
    expect(emptyInput()).not.toHaveProperty('rotY');
    expect(normalizeInput({ forward: true, backward: false, left: false, right: false })).not.toHaveProperty('rotY');
  });

  it('keeps finite client rotations so aiming still updates normally', () => {
    expect(normalizeInput({
      forward: false,
      backward: false,
      left: false,
      right: false,
      rotY: Math.PI / 2
    }).rotY).toBeCloseTo(Math.PI / 2);
  });
});
