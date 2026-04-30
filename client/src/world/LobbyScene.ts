import * as THREE from 'three';
import {
  PLAYER_GRAVITY,
  PLAYER_JUMP_VELOCITY,
  SPLAT_TEST_ARENA_ID,
  type ArenaId,
  type MatchMode,
  type MoveInput
} from '../../../shared/types';
import { LocalPlayerController, type PlayerSnapshot } from '../player/LocalPlayerController';
import type { SplatArenaPreset } from './ArenaPreset';
import type { PlayCanvasSplatLayer } from './PlayCanvasSplatLayer';
import type { VfxRuntime } from '../vfx/VfxRuntime';
import type { MapVfxConfig, MapVfxEntry } from '../vfx/MapVfxConfig';
import { loadMapVfxConfig } from '../vfx/MapVfxConfig';

export interface LobbyPortal {
  mode: MatchMode;
  arenaId?: ArenaId;
  label: string;
  position: THREE.Vector3;
  mesh: THREE.Mesh | null;
}

export class LobbyScene {
  readonly group = new THREE.Group();
  readonly portals: LobbyPortal[] = [];
  readonly player: LocalPlayerController;
  private velocityY = 0;
  private splatLayer: PlayCanvasSplatLayer | null = null;
  private vfxRuntime: VfxRuntime | null = null;
  private vfxInstanceIds: string[] = [];
  private bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  private floorY: number;

  private snapshot: PlayerSnapshot;

  constructor(
    private scene: THREE.Scene,
    private shell: HTMLElement,
    preset?: SplatArenaPreset
  ) {
    this.bounds = preset
      ? { ...preset.bounds }
      : { minX: -16, maxX: 15, minZ: -11, maxZ: 39 };
    this.floorY = preset?.floorY ?? 0;

    const spawn = preset?.spawnPoints[0];
    this.snapshot = {
      id: 'lobby-local',
      name: 'Mage',
      teamId: 'A',
      x: spawn?.x ?? 0,
      y: spawn?.y ?? 0,
      z: spawn?.z ?? 30,
      rotY: spawn?.rotY ?? Math.PI,
      hp: 100,
      mana: 100,
      anim: 'idle',
      casting: false,
      selectedSpell: ''
    };

    this.scene.add(this.group);
    this.player = new LocalPlayerController(this.group, true, 'A');
    this.player.setFirstPersonHidden(true);
    this.player.setName('You');
    this.player.update(this.snapshot, 1, true);
  }

  async loadSplat(camera: THREE.PerspectiveCamera, preset: SplatArenaPreset): Promise<void> {
    const module = await import('./PlayCanvasSplatLayer');
    this.splatLayer = await module.createPlayCanvasSplatLayer({
      container: this.shell,
      camera,
      preset
    });
  }

  async loadVfx(runtime: VfxRuntime, presetId: string): Promise<void> {
    this.vfxRuntime = runtime;
    this.stopVfx();
    const config = await loadMapVfxConfig(presetId);
    if (!config) return;
    for (const entry of config.effects) {
      this.playVfxEntry(entry);
    }
  }

  playVfxEntry(entry: MapVfxEntry): void {
    if (!this.vfxRuntime) return;
    try {
      const instanceId = this.vfxRuntime.play(entry.vfxId, {
        position: new THREE.Vector3(entry.position.x, entry.position.y, entry.position.z),
        rotation: new THREE.Euler(entry.rotation.x, entry.rotation.y, entry.rotation.z),
        loop: true
      });
      const instance = this.vfxRuntime.getInstance(instanceId);
      if (instance && entry.scale !== 1) {
        instance.group.scale.setScalar(entry.scale);
      }
      this.vfxInstanceIds.push(instanceId);
    } catch (err) {
      console.warn(`[LobbyScene] Failed to play VFX "${entry.vfxId}":`, err);
    }
  }

  stopVfx(): void {
    for (const id of this.vfxInstanceIds) {
      this.vfxRuntime?.stop(id);
    }
    this.vfxInstanceIds = [];
  }

  update(input: MoveInput, dt: number, camera?: THREE.PerspectiveCamera): void {
    const yaw = input.rotY ?? this.snapshot.rotY;
    this.snapshot.rotY = yaw;

    const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    let mx = 0;
    let mz = 0;
    if (input.forward) { mx += forward.x; mz += forward.z; }
    if (input.backward) { mx -= forward.x; mz -= forward.z; }
    if (input.right) { mx += right.x; mz += right.z; }
    if (input.left) { mx -= right.x; mz -= right.z; }
    const length = Math.hypot(mx, mz);
    if (length > 0) {
      mx /= length;
      mz /= length;
    }

    this.snapshot.x = clamp(this.snapshot.x + mx * 4.8 * dt, this.bounds.minX, this.bounds.maxX);
    this.snapshot.z = clamp(this.snapshot.z + mz * 4.8 * dt, this.bounds.minZ, this.bounds.maxZ);
    this.applyJump(input, dt);
    this.snapshot.anim = this.snapshot.y > this.floorY + 0.03 || Math.abs(this.velocityY) > 0.01
      ? 'jump'
      : length > 0 ? 'run' : 'idle';
    this.player.update(this.snapshot, dt, true);

    for (const portal of this.portals) {
      if (portal.mesh) {
        const nearest = this.nearestPortal();
        const near = nearest === portal;
        portal.mesh.scale.setScalar(near ? 1.12 : 1);
      }
    }

    if (camera && this.splatLayer) {
      this.splatLayer.updateFromThreeCamera(camera);
    }
  }

  private applyJump(input: MoveInput, dt: number): void {
    const grounded = this.snapshot.y <= this.floorY + 0.02;
    if (grounded && input.jump) {
      this.snapshot.y = this.floorY;
      this.velocityY = PLAYER_JUMP_VELOCITY;
    } else if (grounded && this.velocityY <= 0) {
      this.snapshot.y = this.floorY;
      this.velocityY = 0;
    }

    if (!grounded || this.velocityY > 0) {
      this.velocityY -= PLAYER_GRAVITY * dt;
      this.snapshot.y += this.velocityY * dt;
    }

    if (this.snapshot.y <= this.floorY) {
      this.snapshot.y = this.floorY;
      this.velocityY = 0;
    }
  }

  nearestPortal(): LobbyPortal | null {
    let nearest: LobbyPortal | null = null;
    let nearestDistance = Infinity;
    for (const portal of this.portals) {
      const distance = Math.hypot(this.snapshot.x - portal.position.x, this.snapshot.z - portal.position.z);
      if (distance < nearestDistance) {
        nearest = portal;
        nearestDistance = distance;
      }
    }
    return nearestDistance <= 1.7 ? nearest : null;
  }

  getPlayerPosition(): THREE.Vector3 {
    return new THREE.Vector3(this.snapshot.x, this.snapshot.y, this.snapshot.z);
  }

  getPlayerRotation(): number {
    return this.snapshot.rotY;
  }

  dispose(): void {
    this.stopVfx();
    this.vfxRuntime = null;
    this.splatLayer?.dispose();
    this.splatLayer = null;
    this.player.dispose(this.group);
    this.scene.remove(this.group);
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material?.dispose?.();
    });
  }

  buildPortalsFromVfx(config: MapVfxConfig): void {
    this.portals = [];
    const portalDefs: Array<{ mode: MatchMode; label: string; color: number; arenaId?: ArenaId; badge?: string }> = [
      { mode: '1v1', label: '1v1 Duel', color: 0xff6b35, arenaId: undefined },
      { mode: '2v2', label: '2v2 Team Duel', color: 0x7dd3fc, arenaId: undefined },
      { mode: '1v1', label: 'Realistic Arena Test', color: 0xa78bfa, arenaId: SPLAT_TEST_ARENA_ID, badge: 'EXPERIMENTAL' }
    ];

    for (let i = 0; i < config.effects.length && i < portalDefs.length; i++) {
      const entry = config.effects[i];
      const def = portalDefs[i];
      const pos = new THREE.Vector3(entry.position.x, entry.position.y, entry.position.z);

      const markerGeo = new THREE.RingGeometry(0.15, 0.22, 16);
      const markerMat = new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
      });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(entry.position.x, 0.02, entry.position.z);
      this.group.add(marker);

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(def.label, def.badge), transparent: true }));
      sprite.position.set(entry.position.x, entry.position.y + 1.3, entry.position.z);
      sprite.scale.set(def.badge ? 3.1 : 2.4, def.badge ? 0.8 : 0.55, 1);
      this.group.add(sprite);

      this.portals.push({
        mode: def.mode,
        arenaId: def.arenaId,
        label: def.label,
        position: new THREE.Vector3(entry.position.x, 0, entry.position.z),
        mesh: marker
      });
    }

    for (let i = config.effects.length; i < portalDefs.length; i++) {
      const def = portalDefs[i];
      const defaultPositions = [
        { x: -6, z: 15 },
        { x: 6, z: 15 },
        { x: 0, z: 18 }
      ];
      const pos = defaultPositions[i];

      const markerGeo = new THREE.RingGeometry(0.15, 0.22, 16);
      const markerMat = new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
      });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(pos.x, 0.02, pos.z);
      this.group.add(marker);

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(def.label, def.badge), transparent: true }));
      sprite.position.set(pos.x, 1.35, pos.z);
      sprite.scale.set(def.badge ? 3.1 : 2.4, def.badge ? 0.8 : 0.55, 1);
      this.group.add(sprite);

      this.portals.push({
        mode: def.mode,
        arenaId: def.arenaId,
        label: def.label,
        position: new THREE.Vector3(pos.x, 0, pos.z),
        mesh: marker
      });
    }
  }
}

function makeLabelTexture(label: string, badge?: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 420;
  canvas.height = badge ? 108 : 80;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(21,18,15,0.78)';
  ctx.fillRect(0, 10, canvas.width, canvas.height - 20);
  ctx.strokeStyle = 'rgba(247,231,198,0.36)';
  ctx.strokeRect(0.5, 10.5, canvas.width - 1, canvas.height - 21);
  ctx.fillStyle = '#f7e7c6';
  ctx.font = `bold ${label.length > 16 ? 24 : 28}px Trebuchet MS, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, badge ? 39 : 40);
  if (badge) {
    ctx.fillStyle = '#a78bfa';
    ctx.font = 'bold 17px Trebuchet MS, sans-serif';
    ctx.fillText(badge, canvas.width / 2, 72);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}