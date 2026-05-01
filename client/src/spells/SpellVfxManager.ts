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

interface PlayerStatusSnapshot {
  id: string;
  x: number;
  y: number;
  z: number;
  markedUntil?: number;
  shieldActive?: boolean;
  silencedUntil?: number;
  slowedUntil?: number;
  rootedUntil?: number;
}

interface StatusVisuals {
  mark?: THREE.Group;
  shield?: THREE.Group;
  debuff?: THREE.Group;
}

interface GlacialTelegraph {
  id: string;
  x: number;
  z: number;
  radius: number;
  delayMs: number;
}

interface GlacialEruption {
  id: string;
  x: number;
  z: number;
  radius: number;
  hitTargetIds: string[];
}

export class SpellVfxManager {
  private runtime: VfxRuntime | null = null;
  private projectiles = new Map<string, ActiveProjectile>();
  private playerAttachPoints = new Map<string, THREE.Object3D>();
  private bursts: Array<{ mesh: THREE.Mesh; ttl: number; max: number }> = [];
  private tempVec = new THREE.Vector3();
  private fallbackProjectiles = new Map<string, THREE.Mesh>();
  private statusVisuals = new Map<string, StatusVisuals>();
  private glacialTelegraphs = new Map<string, THREE.Group>();

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
    for (const visuals of this.statusVisuals.values()) {
      for (const object of Object.values(visuals)) {
        if (object) this.disposeObject(object);
      }
    }
    this.statusVisuals.clear();
    for (const telegraph of this.glacialTelegraphs.values()) {
      this.disposeObject(telegraph);
    }
    this.glacialTelegraphs.clear();
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

  playCast(spellId: SpellId, playerId: string, x: number, y: number, z: number): void {
    const vfxId = `${spellId}_cast`;
    const attachPoint = this.playerAttachPoints.get(`${playerId}:caster_hand_right`);
    if (attachPoint && this.runtime) {
      try {
        this.runtime.play(vfxId, { targetObject: attachPoint, attachTo: 'caster_hand_right' });
        return;
      } catch (err) {
        console.warn(`[SpellVfxManager] Cast VFX fallback for "${vfxId}":`, err);
      }
    }

    const position = attachPoint?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3(x, y + 1.15, z);
    this.spawnCastFlash(position, spellId);
  }

  playImpact(spellId: SpellId, position: THREE.Vector3): void {
    const vfxId = `${spellId}_impact`;
    if (this.runtime) {
      try {
        this.runtime.play(vfxId, { position });
        return;
      } catch (err) {
        console.warn(`[SpellVfxManager] Impact VFX fallback for "${vfxId}":`, err);
      }
    }
    this.spawnFallbackImpact(position, spellId);
  }

  playTrapPlaced(x: number, z: number, radius = 1.5): void {
    this.playEventVfx('trap_placed', new THREE.Vector3(x, 0.04, z), () => {
      this.spawnRing(new THREE.Vector3(x, 0.04, z), radius, 0x6d28d9, 0.55, 1.2);
    });
  }

  playTrapTriggered(x: number, z: number): void {
    this.playEventVfx('trap_triggered', new THREE.Vector3(x, 0.08, z), () => {
      this.spawnRing(new THREE.Vector3(x, 0.08, z), 0.78, 0xa855f7, 0.9, 0.42);
      this.spawnFallbackImpact(new THREE.Vector3(x, 0.45, z), 'void_trap');
    });
  }

  playMarkApplied(_targetId: string, position: THREE.Vector3): void {
    this.playEventVfx('mark_applied', position, () => {
      this.spawnRing(new THREE.Vector3(position.x, position.y + 1.55, position.z), 0.42, 0xc084fc, 0.9, 0.45, false);
    });
  }

  playMarkConsumed(position: THREE.Vector3): void {
    this.playEventVfx('mark_consumed', position, () => {
      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.24, 0),
        new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.92, wireframe: true })
      );
      mesh.position.set(position.x, position.y + 1.1, position.z);
      this.scene.add(mesh);
      this.bursts.push({ mesh, ttl: 0.35, max: 0.35 });
    });
  }

  playGroundLine(origin: THREE.Vector3, dir: THREE.Vector3): void {
    const direction = dir.clone().normalize();
    if (this.runtime) {
      try {
        this.runtime.play('ground_line_hit', {
          position: origin,
          rotation: new THREE.Euler(0, Math.atan2(-direction.x, -direction.z), 0)
        });
        return;
      } catch (err) {
        console.warn('[SpellVfxManager] Event VFX fallback for "ground_line_hit":', err);
      }
    }

    {
      for (let i = 1; i <= 5; i++) {
        const t = i * 1.35;
        const pos = new THREE.Vector3().copy(origin).add(direction.clone().multiplyScalar(t));
        const geometry = new THREE.ConeGeometry(0.26, 0.95, 5);
        const material = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x38bdf8, emissiveIntensity: 1.8 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(pos.x, 0.45, pos.z);
        mesh.rotation.z = Math.sin(i) * 0.2;
        this.scene.add(mesh);
        this.bursts.push({ mesh, ttl: 0.42, max: 0.42 });
      }
    }
  }

  playGlacialTelegraph(hazards: GlacialTelegraph[]): void {
    for (const hazard of hazards) {
      if (this.runtime) {
        try {
          this.runtime.play('glacial_spikes_telegraph', {
            position: new THREE.Vector3(hazard.x, 0.045, hazard.z)
          });
        } catch (err) {
          console.warn('[SpellVfxManager] Event VFX fallback for "glacial_spikes_telegraph":', err);
        }
      }

      const existing = this.glacialTelegraphs.get(hazard.id);
      if (existing) this.disposeObject(existing);
      const telegraph = this.createGlacialTelegraph(hazard.radius);
      telegraph.position.set(hazard.x, 0.055, hazard.z);
      telegraph.userData.max = Math.max(0.001, hazard.delayMs / 1000);
      telegraph.userData.ttl = telegraph.userData.max;
      this.scene.add(telegraph);
      this.glacialTelegraphs.set(hazard.id, telegraph);
    }
  }

  playGlacialEruption(hazards: GlacialEruption[]): void {
    for (const hazard of hazards) {
      const telegraph = this.glacialTelegraphs.get(hazard.id);
      if (telegraph) {
        this.disposeObject(telegraph);
        this.glacialTelegraphs.delete(hazard.id);
      }

      const position = new THREE.Vector3(hazard.x, 0.1, hazard.z);
      if (this.runtime) {
        try {
          this.runtime.play('glacial_spikes_erupt', { position });
        } catch (err) {
          console.warn('[SpellVfxManager] Event VFX fallback for "glacial_spikes_erupt":', err);
        }
      }
      this.spawnGlacialSpike(position, hazard.hitTargetIds.length > 0);
    }
  }

  playShieldExplosion(position: THREE.Vector3): void {
    this.playEventVfx('shield_exploded', position, () => {
      this.spawnRing(new THREE.Vector3(position.x, position.y + 0.75, position.z), 1.15, 0xf59e0b, 0.88, 0.5, false);
      this.spawnFallbackImpact(new THREE.Vector3(position.x, position.y + 1, position.z), 'firmament_shield');
    });
  }

  syncPlayerStatusVfx(players: PlayerStatusSnapshot[], now = Date.now()): void {
    const activeIds = new Set(players.map((player) => player.id));

    for (const player of players) {
      const visuals = this.statusVisuals.get(player.id) ?? {};
      const base = new THREE.Vector3(player.x, player.y, player.z);
      const marked = (player.markedUntil ?? 0) > now;
      const debuffed = (player.silencedUntil ?? 0) > now || (player.slowedUntil ?? 0) > now || (player.rootedUntil ?? 0) > now;

      visuals.mark = this.syncStatusObject(visuals.mark, marked, () => this.createMarkStatus(), base, 1.62);
      visuals.shield = this.syncStatusObject(visuals.shield, Boolean(player.shieldActive), () => this.createShieldStatus(), base, 0.95);
      visuals.debuff = this.syncStatusObject(visuals.debuff, debuffed, () => this.createDebuffStatus(), base, 0.08);

      if (visuals.mark || visuals.shield || visuals.debuff) this.statusVisuals.set(player.id, visuals);
      else this.statusVisuals.delete(player.id);
    }

    for (const [playerId, visuals] of this.statusVisuals) {
      if (activeIds.has(playerId)) continue;
      for (const object of Object.values(visuals)) {
        if (object) this.disposeObject(object);
      }
      this.statusVisuals.delete(playerId);
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
    this.playImpact(spellId, new THREE.Vector3(x, y, z));
  }

  update(dt: number): void {
    this.runtime?.update(dt);

    for (const visuals of this.statusVisuals.values()) {
      if (visuals.mark) visuals.mark.rotation.y += dt * 2.6;
      if (visuals.shield) visuals.shield.rotation.y += dt * 1.1;
      if (visuals.debuff) visuals.debuff.rotation.z -= dt * 2;
    }

    for (const [id, telegraph] of this.glacialTelegraphs) {
      telegraph.rotation.y += dt * 2.2;
      telegraph.userData.ttl = Math.max(0, (telegraph.userData.ttl as number) - dt);
      const max = telegraph.userData.max as number;
      const progress = 1 - (telegraph.userData.ttl as number) / max;
      telegraph.scale.setScalar(1 + Math.sin(progress * Math.PI * 6) * 0.04);
      if (telegraph.userData.ttl <= 0) {
        this.disposeObject(telegraph);
        this.glacialTelegraphs.delete(id);
      }
    }

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

  private playEventVfx(vfxId: string, position: THREE.Vector3, fallback: () => void): void {
    if (this.runtime) {
      try {
        this.runtime.play(vfxId, { position });
        return;
      } catch (err) {
        console.warn(`[SpellVfxManager] Event VFX fallback for "${vfxId}":`, err);
      }
    }
    fallback();
  }

  private spawnCastFlash(position: THREE.Vector3, spellId: SpellId): void {
    const spell = SPELLS[spellId] ?? SPELLS.shadow_dart;
    const geometry = new THREE.RingGeometry(0.18, 0.34, 32);
    const material = new THREE.MeshBasicMaterial({
      color: spell.color,
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.lookAt(position.x, position.y + 0.01, position.z - 1);
    this.scene.add(mesh);
    this.bursts.push({ mesh, ttl: 0.28, max: 0.28 });
  }

  private spawnRing(
    position: THREE.Vector3,
    radius: number,
    color: number,
    opacity: number,
    ttl: number,
    floorAligned = true
  ): void {
    const geometry = new THREE.TorusGeometry(radius, Math.max(0.018, radius * 0.04), 8, 48);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    if (floorAligned) mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);
    this.bursts.push({ mesh, ttl, max: ttl });
  }

  private syncStatusObject(
    object: THREE.Group | undefined,
    active: boolean,
    create: () => THREE.Group,
    base: THREE.Vector3,
    yOffset: number
  ): THREE.Group | undefined {
    if (!active) {
      if (object) this.disposeObject(object);
      return undefined;
    }

    const next = object ?? create();
    next.position.set(base.x, base.y + yOffset, base.z);
    if (!object) this.scene.add(next);
    return next;
  }

  private createMarkStatus(): THREE.Group {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.025, 8, 42),
      new THREE.MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.82, depthWrite: false })
    );
    ring.rotation.x = Math.PI / 2;
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12, 0),
      new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.72 })
    );
    group.add(ring, core);
    return group;
  }

  private createShieldStatus(): THREE.Group {
    const group = new THREE.Group();
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 24, 12),
      new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.18, wireframe: true, depthWrite: false })
    );
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.86, 0.018, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.72, depthWrite: false })
    );
    band.rotation.x = Math.PI / 2;
    group.add(shield, band);
    return group;
  }

  private createDebuffStatus(): THREE.Group {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.58, 0.68, 42),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.58, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    return group;
  }

  private createGlacialTelegraph(radius: number): THREE.Group {
    const group = new THREE.Group();
    const outer = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.84, radius, 56),
      new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false })
    );
    outer.rotation.x = -Math.PI / 2;

    const inner = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.52, 0.018, 8, 36),
      new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.82, depthWrite: false })
    );
    inner.rotation.x = Math.PI / 2;

    const crossMaterial = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.54, depthWrite: false });
    const barA = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.55, 0.018, 0.045), crossMaterial.clone());
    const barB = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.018, radius * 1.55), crossMaterial.clone());
    barA.position.y = 0.006;
    barB.position.y = 0.006;

    group.add(outer, inner, barA, barB);
    return group;
  }

  private spawnGlacialSpike(position: THREE.Vector3, hit: boolean): void {
    const height = hit ? 2.65 : 1.9;
    const material = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x38bdf8,
      emissiveIntensity: hit ? 2.4 : 1.6,
      transparent: true,
      opacity: 0.86,
      roughness: 0.18,
      metalness: 0.02
    });

    const main = new THREE.Mesh(new THREE.ConeGeometry(0.42, height, 6), material);
    main.position.set(position.x, height / 2 - 0.15, position.z);
    main.rotation.z = 0.08;
    this.scene.add(main);
    this.bursts.push({ mesh: main, ttl: 0.72, max: 0.72 });

    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const shard = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.95, 5),
        material.clone()
      );
      shard.position.set(
        position.x + Math.cos(angle) * 0.42,
        0.38,
        position.z + Math.sin(angle) * 0.42
      );
      shard.rotation.z = Math.cos(angle) * 0.55;
      shard.rotation.x = Math.sin(angle) * 0.55;
      this.scene.add(shard);
      this.bursts.push({ mesh: shard, ttl: 0.58, max: 0.58 });
    }

    this.spawnRing(new THREE.Vector3(position.x, 0.08, position.z), hit ? 1.1 : 0.82, 0xbae6fd, 0.78, 0.4);
  }

  private disposeObject(object: THREE.Object3D): void {
    this.scene.remove(object);
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material?.dispose?.();
    });
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

  triggeredTrap(x: number, z: number): void {
    this.playTrapTriggered(x, z);
  }

  consumedMark(position: THREE.Vector3): void {
    this.playMarkConsumed(position);
  }

  groundLineHit(origin: THREE.Vector3, dir: THREE.Vector3): void {
    this.playGroundLine(origin, dir);
  }

  explodedShield(position: THREE.Vector3): void {
    this.playShieldExplosion(position);
  }
}
