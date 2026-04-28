import { describe, expect, it } from 'vitest';
import {
  cameraDeltaFromDrag,
  movementFromStickDelta,
  normalizeStickDelta
} from './TouchControls';

describe('mobile touch control mapping', () => {
  it('keeps tiny movement drags idle', () => {
    expect(movementFromStickDelta({ x: 4, y: -3 })).toEqual({
      forward: false,
      backward: false,
      left: false,
      right: false
    });
  });

  it('maps left stick drag direction to movement booleans', () => {
    expect(movementFromStickDelta({ x: 0, y: -42 })).toMatchObject({ forward: true, backward: false });
    expect(movementFromStickDelta({ x: 0, y: 42 })).toMatchObject({ backward: true, forward: false });
    expect(movementFromStickDelta({ x: -42, y: 0 })).toMatchObject({ left: true, right: false });
    expect(movementFromStickDelta({ x: 42, y: 0 })).toMatchObject({ right: true, left: false });
    expect(movementFromStickDelta({ x: 32, y: -36 })).toEqual({
      forward: true,
      backward: false,
      left: false,
      right: true
    });
  });

  it('clamps the visible stick knob to the configured radius', () => {
    expect(normalizeStickDelta({ x: 120, y: 0 }, 54)).toEqual({ x: 54, y: 0 });
    const diagonal = normalizeStickDelta({ x: 80, y: -80 }, 54);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(54, 5);
  });

  it('maps right-side drag to yaw and pitch deltas', () => {
    expect(cameraDeltaFromDrag(40, -20)).toEqual({
      yaw: -0.14,
      pitch: 0.056
    });
  });
});
