import * as THREE from 'three';
import { SPELLS, type SpellId } from '../../../shared/spells';

interface ProjectileSnapshot {
  id: string;
  spellId: SpellId;
  x: number;
  y: number;
  z: number;
}

export class SpellVfxManager {
  private projectiles = new Map<string, THREE.Mesh>();
  private bursts: Array<{ mesh: THREE.Mesh; ttl: number; max: number }> = [];

  constructor(private scene: THREE.Scene) {}

  syncProjectiles(projectiles: ProjectileSnapshot[]): void {
    const active = new Set<string>();

    for (const projectile of projectiles) {
      active.add(projectile.id);
      let mesh = this.projectiles.get(projectile.id);
      if (!mesh) {
        const spell = SPELLS[projectile.spellId] ?? SPELLS.fireball;
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(projectile.spellId === 'ice_bolt' ? 0.18 : 0.24, 12, 12),
          new THREE.MeshStandardMaterial({
            color: spell.color,
            emissive: spell.color,
            emissiveIntensity: 1.8,
            roughness: 0.2
          })
        );
        this.scene.add(mesh);
        this.projectiles.set(projectile.id, mesh);
      }
      mesh.position.set(projectile.x, projectile.y, projectile.z);
    }

    for (const [id, mesh] of this.projectiles) {
      if (!active.has(id)) {
        this.spawnBurst(mesh.position, (mesh.material as THREE.MeshStandardMaterial).color.getHex());
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        this.projectiles.delete(id);
      }
    }
  }

  confirmSpell(spellId: SpellId, x: number, y: number, z: number): void {
    const spell = SPELLS[spellId];
    const geometry = spell.kind === 'dash'
      ? new THREE.TorusGeometry(0.72, 0.03, 8, 48)
      : new THREE.RingGeometry(0.34, 0.62, 48);
    const material = new THREE.MeshBasicMaterial({
      color: spell.color,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y + 0.08, z);
    mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);
    this.bursts.push({ mesh, ttl: 0.42, max: 0.42 });
  }

  update(dt: number): void {
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

  private spawnBurst(position: THREE.Vector3, color: number): void {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.28, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, wireframe: true })
    );
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.bursts.push({ mesh, ttl: 0.3, max: 0.3 });
  }
}
