import { describe, expect, it } from 'vitest';
import { clearRoundInputs, emptyInput, normalizeInput } from './MagicDuelRoom';

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

  it('clears stale rotations before a new round starts', () => {
    const inputs = new Map([
      ['player-a', normalizeInput({ forward: true, backward: false, left: false, right: false, jump: true, rotY: Math.PI / 2 })],
      ['player-b', normalizeInput({ forward: false, backward: false, left: false, right: true, dash: true, rotY: -Math.PI / 2 })]
    ]);

    clearRoundInputs(inputs);

    expect(inputs.get('player-a')).toEqual(emptyInput());
    expect(inputs.get('player-b')).toEqual(emptyInput());
  });
});
