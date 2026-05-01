import * as THREE from 'three';
import type { CharacterClass } from '../../../shared/classes';
import { MAX_HP, type BotSkill } from '../../../shared/types';
import {
  makeCombatNameplateTexture,
  styleForCombatRelation,
  type CombatRelation
} from './CombatIdentity';

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
  isBot?: boolean;
  botSkill?: BotSkill | string;
  shieldActive?: boolean;
  silencedUntil?: number;
  slowedUntil?: number;
  speedBoostUntil?: number;
  markedUntil?: number;
  rootedUntil?: number;
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

  private local: boolean;
  private body: THREE.Mesh;
  private hat: THREE.Mesh;
  private ring: THREE.Mesh;
  private groundShadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private nameSprite: THREE.Sprite;
  private firstPersonHidden = false;
  private shadowGroundY = Number.NaN;
  private nameplateName = 'Mage';
  private nameplateHp = MAX_HP;
  private nameplateRelation: CombatRelation;

  constructor(scene: THREE.Object3D, local: boolean, teamId: string = 'A') {
    this.local = local;
    this.nameplateRelation = local ? 'self' : 'neutral';
    this.group = new THREE.Group();
    const teamColor = teamId === 'B' ? 0x2d9e9b : 0xd95030;
    const bodyColor = local ? teamColor : teamColor;
    const trimColor = styleForCombatRelation(this.nameplateRelation).accentColor;

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
      new THREE.MeshBasicMaterial({
        color: trimColor,
        transparent: true,
        opacity: styleForCombatRelation(this.nameplateRelation).ringOpacity,
        depthWrite: false
      })
    );
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.05;
    this.group.add(this.ring);

    this.nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeCombatNameplateTexture({
        name: this.nameplateName,
        hp: this.nameplateHp,
        relation: this.nameplateRelation
      }),
      transparent: true,
      depthWrite: false
    }));
    this.nameSprite.position.y = 2.34;
    this.nameSprite.scale.set(2.16, 0.65, 1);
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
    this.applyRingState(snapshot.casting);
    this.updateGroundShadow(snapshot, snap);
  }

  setName(name: string): void {
    this.setCombatIdentity({ name });
  }

  setCombatIdentity(update: {
    name?: string;
    hp?: number;
    relation?: CombatRelation;
  }): void {
    const nextName = update.name ?? this.nameplateName;
    const nextHp = update.hp ?? this.nameplateHp;
    const nextRelation = update.relation ?? this.nameplateRelation;
    const changed = nextName !== this.nameplateName
      || nextHp !== this.nameplateHp
      || nextRelation !== this.nameplateRelation;

    this.nameplateName = nextName;
    this.nameplateHp = nextHp;
    this.nameplateRelation = nextRelation;

    if (changed) {
      const material = this.nameSprite.material as THREE.SpriteMaterial;
      material.map?.dispose();
      material.map = makeCombatNameplateTexture({
        name: this.nameplateName,
        hp: this.nameplateHp,
        relation: this.nameplateRelation
      });
      material.needsUpdate = true;
    }

    this.nameSprite.visible = !this.firstPersonHidden && styleForCombatRelation(this.nameplateRelation).showNameplate;
    if (changed) {
      this.applyRingStyle(false);
    }
  }

  setFirstPersonHidden(hidden: boolean): void {
    this.firstPersonHidden = hidden;
    this.body.visible = !hidden;
    this.hat.visible = !hidden;
    this.nameSprite.visible = !hidden && styleForCombatRelation(this.nameplateRelation).showNameplate;
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

  private applyRingState(casting: boolean): void {
    const showRemoteMarker = !this.firstPersonHidden && !this.local && this.nameplateRelation !== 'self';
    this.ring.visible = showRemoteMarker || (!this.firstPersonHidden && casting);
    this.ring.scale.setScalar(casting ? 1.12 : 1);
    this.applyRingStyle(casting);
  }

  private applyRingStyle(casting: boolean): void {
    const style = styleForCombatRelation(this.nameplateRelation);
    const material = this.ring.material as THREE.MeshBasicMaterial;
    material.color.setHex(style.accentColor);
    material.opacity = casting ? Math.min(0.92, style.ringOpacity + 0.22) : style.ringOpacity;
    material.needsUpdate = true;
  }
}

export class RemotePlayerController extends LocalPlayerController {}
