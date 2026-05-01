import * as THREE from 'three';
import {
  findClimbableWall,
  findStandingSurfaceY,
  moveWithArenaCollision,
  resolveArenaVerticalCollision
} from '../../../shared/arenaCollision';
import {
  PLAYER_CLIMB_SPEED,
  PLAYER_GRAVITY,
  PLAYER_AIR_DASH_DISTANCE,
  PLAYER_JUMP_VELOCITY,
  SPLAT_TEST_ARENA_ID,
  type ArenaId,
  type ArenaCollisionWall,
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
  kind: 'queue' | 'custom';
  mode: MatchMode;
  arenaId?: ArenaId;
  label: string;
  position: THREE.Vector3;
  mesh: THREE.Mesh | null;
  visual: THREE.Object3D | null;
  currentScale: number;
}

export class LobbyScene {
  readonly group = new THREE.Group();
  portals: LobbyPortal[] = [];
  readonly player: LocalPlayerController;
  private velocityY = 0;
  private splatLayer: PlayCanvasSplatLayer | null = null;
  private vfxRuntime: VfxRuntime | null = null;
  private vfxInstanceIds: string[] = [];
  private portalUiObjects: THREE.Object3D[] = [];
  private bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  private floorY: number;
  private collisionWalls: ArenaCollisionWall[];
  private airDashAvailable = true;

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
    this.collisionWalls = preset?.collisionWalls ? [...preset.collisionWalls] : [];

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

  async loadVfx(runtime: VfxRuntime, presetId: string): Promise<string[]> {
    this.vfxRuntime = runtime;
    this.stopVfx();
    this.clearPortals();
    const config = await loadMapVfxConfig(presetId);
    const ids: string[] = [];
    const instanceIdsByEntryId = new Map<string, string>();
    if (!config) return ids;
    for (const entry of config.effects) {
      const id = this.playVfxEntry(entry);
      if (id) {
        ids.push(id);
        instanceIdsByEntryId.set(entry.id, id);
      }
    }
    this.buildPortalsFromVfx(config, instanceIdsByEntryId);
    return ids;
  }

  playVfxEntry(entry: MapVfxEntry): string | null {
    if (!this.vfxRuntime) return null;
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
      return instanceId;
    } catch (err) {
      console.warn(`[LobbyScene] Failed to play VFX "${entry.vfxId}":`, err);
      return null;
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
    let length = Math.hypot(mx, mz);
    if (length > 0) {
      mx /= length;
      mz /= length;
    } else if (input.dash) {
      mx = forward.x;
      mz = forward.z;
      length = 1;
    }

    const dashDistance = this.consumeAirDash(input);
    const nextX = this.snapshot.x + mx * (4.8 * dt + dashDistance);
    const nextZ = this.snapshot.z + mz * (4.8 * dt + dashDistance);
    const resolved = moveWithArenaCollision(
      this.snapshot.x,
      this.snapshot.z,
      nextX,
      nextZ,
      this.bounds,
      this.collisionWalls,
      {
        playerY: this.snapshot.y,
        floorY: this.floorY
      }
    );
    this.snapshot.x = resolved.x;
    this.snapshot.z = resolved.z;
    this.applyJump(input, dt);
    this.snapshot.anim = this.snapshot.y > this.floorY + 0.03 || Math.abs(this.velocityY) > 0.01
      ? 'jump'
      : length > 0 ? 'run' : 'idle';
    this.player.update(this.snapshot, dt, true);
    this.vfxRuntime?.update(dt);

    const nearest = this.nearestPortal();
    for (const portal of this.portals) {
      this.updatePortalVisual(portal, nearest === portal, dt);
    }

    if (camera && this.splatLayer) {
      this.splatLayer.updateFromThreeCamera(camera);
    }
  }

  private applyJump(input: MoveInput, dt: number): void {
    const climbableWall = findClimbableWall(this.snapshot.x, this.snapshot.z, this.collisionWalls);
    if (climbableWall) {
      const maxY = this.floorY + Math.max(0.1, climbableWall.height);
      const climbDirection = (input.forward || input.jump ? 1 : 0) - (input.backward ? 1 : 0);
      this.snapshot.y = clamp(this.snapshot.y + climbDirection * PLAYER_CLIMB_SPEED * dt, this.floorY, maxY);
      this.velocityY = 0;
      return;
    }

    const groundY = findStandingSurfaceY(this.snapshot.x, this.snapshot.z, this.snapshot.y, this.floorY, this.collisionWalls);
    const grounded = Math.abs(this.snapshot.y - groundY) <= 0.02;
    if (grounded && input.jump) {
      this.snapshot.y = groundY;
      this.velocityY = PLAYER_JUMP_VELOCITY;
      this.airDashAvailable = true;
    } else if (grounded && this.velocityY <= 0) {
      this.snapshot.y = groundY;
      this.velocityY = 0;
      this.airDashAvailable = true;
    }

    if (!grounded || this.velocityY > 0) {
      const previousY = this.snapshot.y;
      this.velocityY -= PLAYER_GRAVITY * dt;
      const vertical = resolveArenaVerticalCollision(
        this.snapshot.x,
        this.snapshot.z,
        previousY,
        this.snapshot.y + this.velocityY * dt,
        this.velocityY,
        this.floorY,
        this.collisionWalls
      );
      this.snapshot.y = vertical.y;
      this.velocityY = vertical.velocityY;
    }

    if (this.snapshot.y <= groundY) {
      this.snapshot.y = groundY;
      this.velocityY = 0;
      this.airDashAvailable = true;
    }
  }

  private consumeAirDash(input: MoveInput): number {
    const groundY = findStandingSurfaceY(this.snapshot.x, this.snapshot.z, this.snapshot.y, this.floorY, this.collisionWalls);
    const grounded = Math.abs(this.snapshot.y - groundY) <= 0.02;
    if (grounded) {
      this.airDashAvailable = true;
      return 0;
    }
    if (!input.dash || !this.airDashAvailable) {
      return 0;
    }

    this.airDashAvailable = false;
    return PLAYER_AIR_DASH_DISTANCE;
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
    this.clearPortals();
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

  clearPortals(): void {
    if (this.portalUiObjects.length > 0) {
      for (const object of this.portalUiObjects) {
        this.group.remove(object);
        disposeObject(object);
      }
      this.portalUiObjects = [];
    } else {
      for (const portal of this.portals) {
        if (portal.mesh) {
          this.group.remove(portal.mesh);
          portal.mesh.geometry.dispose();
          const mat = portal.mesh.material as THREE.Material;
          mat?.dispose?.();
        }
      }
    }
    this.portals.length = 0;
  }

  buildPortalsFromVfx(config: MapVfxConfig, instanceIdsByEntryId = new Map<string, string>()): void {
    this.clearPortals();
    const portalDefs: Array<{ kind: 'queue' | 'custom'; mode: MatchMode; label: string; color: number; arenaId?: ArenaId; badge?: string }> = [
      { kind: 'queue', mode: '1v1', label: '1v1 Duel', color: 0xff9f43, arenaId: undefined },
      { kind: 'queue', mode: '2v2', label: '2v2 Team Duel', color: 0x7dd3fc, arenaId: undefined },
      { kind: 'custom', mode: '1v1', label: 'CUSTOM', color: 0xa78bfa, arenaId: SPLAT_TEST_ARENA_ID, badge: 'INVITE CODE' }
    ];

    for (let i = 0; i < config.effects.length && i < portalDefs.length; i++) {
      const entry = config.effects[i];
      const instanceId = instanceIdsByEntryId.get(entry.id);
      const visual = instanceId ? this.vfxRuntime?.getInstance(instanceId)?.group ?? null : null;
      this.addPortal(portalDefs[i], {
        x: entry.position.x,
        y: entry.position.y,
        z: entry.position.z
      }, visual);
    }

    for (let i = config.effects.length; i < portalDefs.length; i++) {
      const defaultPositions = [
        { x: -6, y: 1.55, z: 15 },
        { x: 6, y: 1.55, z: 15 },
        { x: 0, y: 1.55, z: 18 }
      ];
      this.addPortal(portalDefs[i], defaultPositions[i], null);
    }
  }

  private addPortal(
    def: { kind: 'queue' | 'custom'; mode: MatchMode; label: string; color: number; arenaId?: ArenaId; badge?: string },
    pos: { x: number; y: number; z: number },
    visual: THREE.Object3D | null
  ): void {
    const markerGeo = new THREE.CircleGeometry(0.92, 48);
    const markerMat = new THREE.MeshBasicMaterial({
      color: def.color,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(pos.x, 0.035, pos.z);
    this.group.add(marker);
    this.portalUiObjects.push(marker);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(def.label, def.badge), transparent: true }));
    sprite.position.set(pos.x, pos.y + 1.75, pos.z);
    sprite.scale.set(def.badge ? 3.1 : 2.4, def.badge ? 0.8 : 0.55, 1);
    this.group.add(sprite);
    this.portalUiObjects.push(sprite);

    this.portals.push({
      kind: def.kind,
      mode: def.mode,
      arenaId: def.arenaId,
      label: def.label,
      position: new THREE.Vector3(pos.x, 0, pos.z),
      mesh: marker,
      visual,
      currentScale: 1
    });
  }

  private updatePortalVisual(portal: LobbyPortal, near: boolean, dt: number): void {
    const t = Math.min(1, dt * 5);
    portal.currentScale = THREE.MathUtils.lerp(portal.currentScale, near ? 1.12 : 1, t);
    portal.mesh?.scale.setScalar(portal.currentScale);
    portal.visual?.scale.setScalar(portal.currentScale);

    if (portal.mesh) {
      const mat = portal.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, near ? 0.34 : 0.16, t);
    }
  }
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) {
      material.forEach((entry) => disposeMaterial(entry));
    } else if (material) {
      disposeMaterial(material);
    }
  });
}

function disposeMaterial(material: THREE.Material): void {
  const materialWithMap = material as THREE.Material & { map?: THREE.Texture };
  materialWithMap.map?.dispose?.();
  material.dispose();
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
