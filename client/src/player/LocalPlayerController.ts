import * as THREE from 'three';
import type { CharacterClass } from '../../../shared/classes';

export interface PlayerSnapshot {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  hp: number;
  mana: number;
  anim: string;
  casting: boolean;
  selectedSpell: string;
  teamId?: string;
  characterClass?: CharacterClass;
  shadowDartReadyAt?: number;
  voidTrapReadyAt?: number;
  abyssalClawReadyAt?: number;
  eclipseReadyAt?: number;
  judgmentRayReadyAt?: number;
  penitentSealReadyAt?: number;
  glacialSpikesReadyAt?: number;
  firmamentShieldReadyAt?: number;
}

export class LocalPlayerController {
  group: THREE.Group;
  target = new THREE.Vector3();

  private body: THREE.Mesh;
  private hat: THREE.Mesh;
  private ring: THREE.Mesh;
  private groundShadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private nameSprite: THREE.Sprite;
  private firstPersonHidden = false;
  private shadowGroundY = Number.NaN;

  constructor(scene: THREE.Object3D, local: boolean, teamId: string = 'A') {
    this.group = new THREE.Group();
    const teamColor = teamId === 'B' ? 0x2d9e9b : 0xd95030;
    const bodyColor = local ? teamColor : teamColor;
    const trimColor = local ? 0xf5c45e : teamId === 'B' ? 0x7dd3fc : 0xffb07c;

    this.groundShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 32),
      new THREE.MeshBasicMaterial({
        color: 0x050403,
        transparent: true,
        opacity: 0.24,
        depthWrite: false
      })
    );
    this.groundShadow.rotation.x = -Math.PI / 2;
    this.groundShadow.renderOrder = 4;
    scene.add(this.groundShadow);

    this.body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.95, 5, 10),
      new THREE.MeshStandardMaterial({
        color: bodyColor,
        roughness: 0.32,
        metalness: 0.08,
        emissive: bodyColor,
        emissiveIntensity: 0.25
      })
    );
    this.body.position.y = 0.85;
    this.body.castShadow = true;
    this.group.add(this.body);

    this.hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 0.62, 5),
      new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.46, emissive: trimColor, emissiveIntensity: 0.22 })
    );
    this.hat.position.y = 1.62;
    this.hat.castShadow = true;
    this.group.add(this.hat);

    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.018, 6, 36),
      new THREE.MeshBasicMaterial({ color: trimColor })
    );
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.05;
    this.group.add(this.ring);

    this.nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeNameTexture('Mage'), transparent: true }));
    this.nameSprite.position.y = 2.25;
    this.nameSprite.scale.set(1.8, 0.45, 1);
    this.group.add(this.nameSprite);

    scene.add(this.group);
  }

  update(snapshot: PlayerSnapshot, dt: number, snap = false): void {
    this.target.set(snapshot.x, snapshot.y, snapshot.z);
    if (snap) this.group.position.copy(this.target);
    else this.group.position.lerp(this.target, Math.min(1, dt * 12));

    this.group.rotation.y = snapshot.rotY;
    this.body.scale.y = snapshot.casting ? 1.08 : 1;
    this.hat.rotation.y += dt * (snapshot.anim === 'run' ? 6 : 1.8);
    this.ring.visible = !this.firstPersonHidden && snapshot.casting;
    this.updateGroundShadow(snapshot, snap);
  }

  setName(name: string): void {
    const material = this.nameSprite.material as THREE.SpriteMaterial;
    material.map?.dispose();
    material.map = makeNameTexture(name);
    material.needsUpdate = true;
  }

  setFirstPersonHidden(hidden: boolean): void {
    this.firstPersonHidden = hidden;
    this.body.visible = !hidden;
    this.hat.visible = !hidden;
    this.nameSprite.visible = !hidden;
    this.ring.visible = false;
  }

  dispose(scene: THREE.Object3D): void {
    scene.remove(this.group);
    scene.remove(this.groundShadow);
    (this.nameSprite.material as THREE.SpriteMaterial).map?.dispose();
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material?.dispose?.();
    });
    this.groundShadow.geometry.dispose();
    this.groundShadow.material.dispose();
  }

  private updateGroundShadow(snapshot: PlayerSnapshot, snap: boolean): void {
    if (Number.isNaN(this.shadowGroundY) || snapshot.y <= this.shadowGroundY + 0.08 || snapshot.anim !== 'jump') {
      this.shadowGroundY = snapshot.y;
    }

    const airborneHeight = Math.max(0, snapshot.y - this.shadowGroundY);
    const alpha = THREE.MathUtils.clamp(0.24 - airborneHeight * 0.08, 0.08, 0.24);
    const scale = THREE.MathUtils.clamp(1 + airborneHeight * 0.12, 1, 1.28);

    this.groundShadow.position.set(this.group.position.x, this.shadowGroundY + 0.018, this.group.position.z);
    this.groundShadow.scale.set(scale, scale, 1);
    this.groundShadow.material.opacity = alpha;
  }
}

export class RemotePlayerController extends LocalPlayerController {}

function makeNameTexture(name: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(21,18,15,0.74)';
  context.fillRect(0, 8, canvas.width, 48);
  context.strokeStyle = 'rgba(247,231,198,0.35)';
  context.strokeRect(0.5, 8.5, canvas.width - 1, 47);
  context.fillStyle = '#f7e7c6';
  context.font = 'bold 24px Trebuchet MS, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(name.slice(0, 18), canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
