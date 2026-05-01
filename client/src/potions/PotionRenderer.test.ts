import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { PublicPotionState } from '../../../shared/types';
import { PotionRenderer } from './PotionRenderer';

function potion(update: Partial<PublicPotionState> = {}): PublicPotionState {
  return {
    id: 'potion-1',
    type: 'health',
    x: 1,
    y: 2,
    z: 3,
    state: 'falling',
    spawnedAt: 100,
    landedAt: 0,
    expiresAt: 0,
    ...update
  };
}

describe('PotionRenderer', () => {
  it('creates, updates, and removes potion objects from replicated state', () => {
    const scene = new THREE.Group();
    const renderer = new PotionRenderer(scene);

    renderer.sync([potion()]);

    expect(scene.children).toHaveLength(1);
    expect(scene.children[0].position.toArray()).toEqual([1, 2, 3]);

    renderer.sync([potion({ x: 4, y: 0, z: -2, state: 'grounded' })]);
    expect(scene.children).toHaveLength(1);
    expect(scene.children[0].position.toArray()).toEqual([4, 0, -2]);

    renderer.sync([]);
    expect(scene.children).toHaveLength(0);
  });

  it('animates grounded potions without moving falling potion anchors', () => {
    const scene = new THREE.Group();
    const renderer = new PotionRenderer(scene);

    renderer.sync([potion({ state: 'grounded', y: 0 })]);
    const before = scene.children[0].children[0].position.y;
    renderer.update(0.5);
    const after = scene.children[0].children[0].position.y;

    expect(after).not.toBe(before);

    renderer.sync([potion({ state: 'falling', y: 4 })]);
    renderer.update(0.5);
    expect(scene.children[0].position.y).toBe(4);
  });

  it('adds a short collection pulse at the consumed potion position', () => {
    const scene = new THREE.Group();
    const renderer = new PotionRenderer(scene);

    renderer.playCollected({ type: 'mana', x: 2, y: 0, z: -3 });

    expect(scene.children).toHaveLength(1);
    expect(scene.children[0].position.toArray()).toEqual([2, 0.08, -3]);

    renderer.update(1);
    expect(scene.children).toHaveLength(0);
  });
});
