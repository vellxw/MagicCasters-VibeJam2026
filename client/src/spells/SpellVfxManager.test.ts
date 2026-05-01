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

  it('creates separate fallback effects for cast, impact, trap, mark, line, and shield events', () => {
    const attach = new THREE.Object3D();
    attach.position.set(1, 2, 3);
    manager.setPlayerAttachPoint('player1', 'caster_hand_right', attach);

    manager.playCast('shadow_dart', 'player1', 0, 0, 0);
    manager.playImpact('shadow_dart', new THREE.Vector3(0, 1, 0));
    manager.playTrapPlaced(1, 2);
    manager.playTrapTriggered(1, 2);
    manager.playMarkApplied('player2', new THREE.Vector3(0, 1, 0));
    manager.playMarkConsumed(new THREE.Vector3(0, 1, 0));
    manager.playGroundLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1));
    manager.playGlacialTelegraph([{ id: 'hazard-1', x: 0, z: -1, radius: 1.15, delayMs: 850 }]);
    manager.playGlacialEruption([{ id: 'hazard-1', x: 0, z: -1, radius: 1.15, hitTargetIds: ['player2'] }]);
    manager.playShieldExplosion(new THREE.Vector3(0, 1, 0));

    expect(scene.children.length).toBeGreaterThan(0);
  });

  it('cleans up everything on reset', () => {
    manager.syncProjectiles([{ id: 'p1', spellId: 'shadow_dart' as const, x: 0, y: 0, z: 0 }]);
    manager.playImpact('shadow_dart', new THREE.Vector3(0, 0, 0));
    manager.syncPlayerStatusVfx([
      { id: 'player1', x: 0, y: 0, z: 0, markedUntil: Date.now() + 1000 }
    ]);
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

  it('keeps persistent status visuals synced to player snapshots', () => {
    const now = 1000;
    manager.syncPlayerStatusVfx([
      {
        id: 'player1',
        x: 2,
        y: 0,
        z: -1,
        shieldActive: true,
        markedUntil: 2000,
        slowedUntil: 2000
      }
    ], now);

    expect(scene.children.length).toBeGreaterThan(0);

    manager.syncPlayerStatusVfx([], now);
    expect(scene.children.length).toBe(0);
  });
});
