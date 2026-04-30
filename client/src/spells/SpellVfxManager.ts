import * as THREE from 'three';
import { SPELLS, type SpellId } from '../../../shared/spells';
import { VfxRuntime } from '../vfx/VfxRuntime';
import { VfxLibrary } from '../vfx/VfxLibrary';
import { VfxLoader } from '../vfx/VfxLoader';
import type { AttachPoint } from '../vfx/types';

interface ProjectileSnapshot {
  id: string;
  spellId: SpellId;
  x: number;
  y: number;
  z: number;
}

interface ActiveProjectile {
  id: string;
  instanceId?: string;
  spellId: SpellId;
  isVfx: boolean;
}

export class SpellVfxManager {
  private runtime: VfxRuntime | null = null;
  private projectiles = new Map<string, ActiveProjectile>();
  private playerAttachPoints = new Map<string, THREE.Object3D>();
  private bursts: Array<{ mesh: THREE.Mesh; ttl: number; max: number }> = [];
  private tempVec = new THREE.Vector3();
  private fallbackProjectiles = new Map<string, THREE.Mesh>();

  constructor(private scene: THREE.Scene) {}

  async preload(): Promise<void> {
    if (this.runtime) return;
    const library = new VfxLibrary();
    const loader = new VfxLoader();
    this.runtime = new VfxRuntime(this.scene, library, loader);
    await this.runtime.preloadFromIndex();
  }

  reset(): void {
    this.runtime?.stopAll();
    for (const mesh of this.fallbackProjectiles.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.fallbackProjectiles.clear();
    for (const burst of this.bursts) {
      this.scene.remove(burst.mesh);
      burst.mesh.geometry.dispose();
      (burst.mesh.material as THREE.Material).dispose();
    }
    this.bursts = [];
    this.projectiles.clear();
  }

  setPlayerAttachPoint(playerId: string, name: AttachPoint, object: THREE.Object3D): void {
    this.playerAttachPoints.set(`${playerId}:${name}`, object);
  }

  playAtAttachPoint(vfxId: string, playerId: string, attachPoint: AttachPoint): void {
    const obj = this.playerAttachPoints.get(`${playerId}:${attachPoint}`);
    if (!obj) return;
    if (!this.runtime) {
      // Fallback: nothing for cast if runtime not ready
      return;
    }
    try {
      this.runtime.play(vfxId, { targetObject: obj, attachTo: attachPoint });
    } catch (err) {
      console.warn(`[SpellVfxManager] Failed to play VFX "${vfxId}" at attach point:`, err);
    }
  }

  syncProjectiles(projectiles: ProjectileSnapshot[]): void {
    const active = new Set<string>();

    for (const projectile of projectiles) {
      active.add(projectile.id);
      let existing = this.projectiles.get(projectile.id);
      if (!existing) {
        const vfxId = `${projectile.spellId}_projectile`;
        let instanceId: string | undefined;
        let isVfx = false;
        if (this.runtime) {
          try {
            instanceId = this.runtime.play(vfxId, {
              attachTo: 'projectile',
              position: new THREE.Vector3(projectile.x, projectile.y, projectile.z),
              loop: true
            });
            isVfx = true;
          } catch (err) {
            console.warn(`[SpellVfxManager] Projectile VFX fallback for "${vfxId}":`, err);
          }
        }
        if (!instanceId) {
          instanceId = this.createFallbackProjectile(projectile);
        }
        existing = { id: projectile.id, instanceId, spellId: projectile.spellId, isVfx };
        this.projectiles.set(projectile.id, existing);
      }
      this.tempVec.set(projectile.x, projectile.y, projectile.z);
      if (existing.isVfx && this.runtime && existing.instanceId) {
        this.runtime.setInstancePosition(existing.instanceId, this.tempVec);
      } else if (existing.instanceId) {
        const mesh = this.fallbackProjectiles.get(existing.instanceId);
        if (mesh) mesh.position.copy(this.tempVec);
      }
    }

    for (const [id, existing] of this.projectiles) {
      if (!active.has(id)) {
        if (existing.isVfx && this.runtime) {
          const instance = this.runtime.getInstance(existing.instanceId ?? '');
          if (instance) {
            const impactVfxId = `${existing.spellId}_impact`;
            try {
              this.runtime.play(impactVfxId, { position: instance.group.position });
            } catch (err) {
              this.spawnFallbackImpact(instance.group.position, existing.spellId);
            }
          }
          this.runtime.stop(existing.instanceId ?? '');
        } else if (existing.instanceId) {
          const mesh = this.fallbackProjectiles.get(existing.instanceId);
          if (mesh) {
            this.spawnFallbackImpact(mesh.position, existing.spellId);
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
            this.fallbackProjectiles.delete(existing.instanceId);
          }
        }
        this.projectiles.delete(id);
      }
    }
  }

  confirmSpell(spellId: SpellId, x: number, y: number, z: number): void {
    const vfxId = `${spellId}_impact`;
    if (this.runtime) {
      try {
        this.runtime.play(vfxId, { position: new THREE.Vector3(x, y, z) });
        return;
      } catch (err) {
        console.warn(`[SpellVfxManager] Impact VFX fallback for "${vfxId}":`, err);
      }
    }
    this.spawnFallbackImpact(new THREE.Vector3(x, y, z), spellId);
  }

  update(dt: number): void {
    this.runtime?.update(dt);

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i];
      burst.ttl -= dt;
      const progress = 1 - burst.ttl / burst.max;
      burst.mesh.scale.setScalar(1 + progress * 2.2);
      const material = burst.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, 0.85 * (1 - progress));
      if (burst.ttl <= 0) {
        this.scene.remove(burst.mesh);
        burst.mesh.geometry.dispose();
        material.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }

  private createFallbackProjectile(projectile: ProjectileSnapshot): string {
    const spell = SPELLS[projectile.spellId] ?? SPELLS.shadow_dart;
    const id = THREE.MathUtils.generateUUID();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(projectile.spellId === 'abyssal_claw' ? 0.18 : 0.24, 12, 12),
      new THREE.MeshStandardMaterial({
        color: spell.color,
        emissive: spell.color,
        emissiveIntensity: 1.8,
        roughness: 0.2
      })
    );
    mesh.position.set(projectile.x, projectile.y, projectile.z);
    this.scene.add(mesh);
    this.fallbackProjectiles.set(id, mesh);
    return id;
  }

  private spawnFallbackImpact(position: THREE.Vector3, spellId: SpellId): void {
    const spell = SPELLS[spellId] ?? SPELLS.shadow_dart;
    const geometry = new THREE.IcosahedronGeometry(0.28, 0);
    const material = new THREE.MeshBasicMaterial({
      color: spell.color,
      transparent: true,
      opacity: 0.72,
      wireframe: true
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    this.bursts.push({ mesh, ttl: 0.3, max: 0.3 });
    this.scene.add(mesh);
  }
}
