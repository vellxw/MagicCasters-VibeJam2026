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

export interface LobbyPortal {
  mode: MatchMode;
  arenaId?: ArenaId;
  label: string;
  position: THREE.Vector3;
  mesh: THREE.Mesh;
}

const LOBBY_BOUNDS = {
  minX: -7,
  maxX: 7,
  minZ: -5,
  maxZ: 5
};
const LOBBY_FLOOR_Y = 0;

export class LobbyScene {
  readonly group = new THREE.Group();
  readonly portals: LobbyPortal[] = [];
  readonly player: LocalPlayerController;
  private velocityY = 0;

  private snapshot: PlayerSnapshot = {
    id: 'lobby-local',
    name: 'Mage',
    teamId: 'A',
    x: 0,
    y: 0,
    z: 4.45,
    rotY: 0,
    hp: 100,
    mana: 100,
    anim: 'idle',
    casting: false,
    selectedSpell: ''
  };

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.group);
    this.buildEnvironment();
    this.player = new LocalPlayerController(this.group, true, 'A');
    this.player.setFirstPersonHidden(true);
    this.player.setName('You');
    this.player.update(this.snapshot, 1, true);
  }

  update(input: MoveInput, dt: number): void {
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

    this.snapshot.x = clamp(this.snapshot.x + mx * 4.8 * dt, LOBBY_BOUNDS.minX, LOBBY_BOUNDS.maxX);
    this.snapshot.z = clamp(this.snapshot.z + mz * 4.8 * dt, LOBBY_BOUNDS.minZ, LOBBY_BOUNDS.maxZ);
    this.applyJump(input, dt);
    this.snapshot.anim = this.snapshot.y > LOBBY_FLOOR_Y + 0.03 || Math.abs(this.velocityY) > 0.01
      ? 'jump'
      : length > 0 ? 'run' : 'idle';
    this.player.update(this.snapshot, dt, true);

    const nearest = this.nearestPortal();
    for (const portal of this.portals) {
      portal.mesh.rotation.y += dt * 0.8;
      const near = nearest === portal;
      portal.mesh.scale.setScalar(near ? 1.12 : 1);
    }
  }

  private applyJump(input: MoveInput, dt: number): void {
    const grounded = this.snapshot.y <= LOBBY_FLOOR_Y + 0.02;
    if (grounded && input.jump) {
      this.snapshot.y = LOBBY_FLOOR_Y;
      this.velocityY = PLAYER_JUMP_VELOCITY;
    } else if (grounded && this.velocityY <= 0) {
      this.snapshot.y = LOBBY_FLOOR_Y;
      this.velocityY = 0;
    }

    if (!grounded || this.velocityY > 0) {
      this.velocityY -= PLAYER_GRAVITY * dt;
      this.snapshot.y += this.velocityY * dt;
    }

    if (this.snapshot.y <= LOBBY_FLOOR_Y) {
      this.snapshot.y = LOBBY_FLOOR_Y;
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

  private buildEnvironment(): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(17, 13),
      new THREE.MeshStandardMaterial({ color: 0x242017, roughness: 0.78 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.group.add(floor);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.5, 2.65, 72),
      new THREE.MeshBasicMaterial({ color: 0xf5c45e, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    this.group.add(ring);

    this.createPortal('1v1', '1v1 Duel', -4.4, -2.25, 0xff6b35);
    this.createPortal('2v2', '2v2 Team Duel', 4.4, -2.25, 0x7dd3fc);
    this.createPortal('1v1', 'Realistic Arena Test', 0, 1.75, 0xa78bfa, {
      arenaId: SPLAT_TEST_ARENA_ID,
      badge: 'EXPERIMENTAL'
    });
  }

  private createPortal(
    mode: MatchMode,
    label: string,
    x: number,
    z: number,
    color: number,
    options: { arenaId?: ArenaId; badge?: string } = {}
  ): void {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.08, 10, 48),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, roughness: 0.22 })
    );
    mesh.position.set(x, 1.05, z);
    mesh.rotation.x = Math.PI / 2;
    this.group.add(mesh);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.1, 0.15, 32),
      new THREE.MeshStandardMaterial({ color: 0x3b2f25, roughness: 0.5 })
    );
    base.position.set(x, 0.075, z);
    this.group.add(base);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(label, options.badge), transparent: true }));
    sprite.position.set(x, 2.35, z);
    sprite.scale.set(options.badge ? 3.1 : 2.4, options.badge ? 0.8 : 0.55, 1);
    this.group.add(sprite);

    this.portals.push({ mode, arenaId: options.arenaId, label, position: new THREE.Vector3(x, 0, z), mesh });
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
