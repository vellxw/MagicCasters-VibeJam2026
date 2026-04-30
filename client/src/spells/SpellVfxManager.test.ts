import { describe, expect, it, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SpellVfxManager } from './SpellVfxManager';

describe('SpellVfxManager', () => {
  let scene: THREE.Scene;
  let manager: SpellVfxManager;

  beforeEach(() => {
    scene = new THREE.Scene();
    manager = new SpellVfxManager(scene);
  });

  it('creates fallback projectile when runtime is not ready', () => {
    const projectiles = [{ id: 'p1', spellId: 'shadow_dart' as const, x: 1, y: 2, z: 3 }];
    manager.syncProjectiles(projectiles);
    expect(scene.children.length).toBeGreaterThan(0);
  });

  it('creates fallback burst on confirmSpell when runtime is not ready', () => {
    manager.confirmSpell('shadow_dart', 0, 0, 0);
    expect(scene.children.length).toBeGreaterThan(0);
  });

  it('cleans up everything on reset', () => {
    manager.syncProjectiles([{ id: 'p1', spellId: 'shadow_dart' as const, x: 0, y: 0, z: 0 }]);
    manager.confirmSpell('shadow_dart', 0, 0, 0);
    manager.reset();
    expect(scene.children.length).toBe(0);
  });

  it('registers attach points', () => {
    const obj = new THREE.Object3D();
    manager.setPlayerAttachPoint('player1', 'caster_hand_right', obj);
    // No public getter; verify no throw
    expect(() => manager.playAtAttachPoint('shadow_dart_cast', 'player1', 'caster_hand_right')).not.toThrow();
  });

  it('update does not crash with empty state', () => {
    expect(() => manager.update(0.016)).not.toThrow();
  });
});
