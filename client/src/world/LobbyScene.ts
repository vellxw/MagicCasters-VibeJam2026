import * as THREE from 'three';
import type { MatchMode, MoveInput } from '../../../shared/types';
import { LocalPlayerController, type PlayerSnapshot } from '../player/LocalPlayerController';

export interface LobbyPortal {
  mode: MatchMode;
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

export class LobbyScene {
  readonly group = new THREE.Group();
  readonly portals: LobbyPortal[] = [];
  readonly player: LocalPlayerController;

  private snapshot: PlayerSnapshot = {
    id: 'lobby-local',
    name: 'Mage',
    teamId: 'A',
    x: 0,
    y: 0,
    z: 2.8,
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
    this.snapshot.anim = length > 0 ? 'run' : 'idle';
    this.player.update(this.snapshot, dt, true);

    for (const portal of this.portals) {
      portal.mesh.rotation.y += dt * 0.8;
      const near = this.nearestPortal()?.mode === portal.mode;
      portal.mesh.scale.setScalar(near ? 1.12 : 1);
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

    this.createPortal('1v1', '1v1 Duel', -3.6, -2.2, 0xff6b35);
    this.createPortal('2v2', '2v2 Team Duel', 3.6, -2.2, 0x7dd3fc);
  }

  private createPortal(mode: MatchMode, label: string, x: number, z: number, color: number): void {
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

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeLabelTexture(label), transparent: true }));
    sprite.position.set(x, 2.35, z);
    sprite.scale.set(2.4, 0.55, 1);
    this.group.add(sprite);

    this.portals.push({ mode, label, position: new THREE.Vector3(x, 0, z), mesh });
  }
}

function makeLabelTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(21,18,15,0.78)';
  ctx.fillRect(0, 10, 320, 60);
  ctx.strokeStyle = 'rgba(247,231,198,0.36)';
  ctx.strokeRect(0.5, 10.5, 319, 59);
  ctx.fillStyle = '#f7e7c6';
  ctx.font = 'bold 28px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 160, 40);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
