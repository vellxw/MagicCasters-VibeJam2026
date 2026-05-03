import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CLASSES, type CharacterClass } from '../../../shared/classes';
import { MAX_HP } from '../../../shared/types';
import type { PlayerSnapshot } from './LocalPlayerController';
import { applyCharacterLighting } from './CharacterLighting';
import {
  makeCombatNameplateTexture,
  styleForCombatRelation,
  type CombatRelation
} from './CombatIdentity';
import { assetUrl } from '../world/AssetUrls';

const ANIM_MAP: Record<string, string> = {
  idle: 'reposo',
  run: 'Correr',
  jump: 'SaltoSinCorrer',
  casting: 'lanzarmagia',
  victory: 'BaileVictoria',
  defeat: 'DerrotaCaida'
};

export class AnimatedPlayerController {
  group: THREE.Group;
  target = new THREE.Vector3();
  modelLoaded = true;

  private local: boolean;
  private modelRoot: THREE.Group | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private currentAction: THREE.AnimationAction | null = null;
  private groundShadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private nameSprite: THREE.Sprite;
  private ring: THREE.Mesh;
  private firstPersonHidden = false;
  private shadowGroundY = Number.NaN;
  private defeatAnimationFinished = false;
  private nameplateName = 'Mage';
  private nameplateHp = MAX_HP;
  private nameplateRelation: CombatRelation;

  static create(
    scene: THREE.Object3D,
    local: boolean,
    gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] },
    characterClass: CharacterClass,
    teamId: string = 'A'
  ): AnimatedPlayerController {
    return new AnimatedPlayerController(scene, local, gltf, characterClass, teamId);
  }

  private constructor(
    scene: THREE.Object3D,
    local: boolean,
    gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] },
    characterClass: CharacterClass,
    teamId: string = 'A'
  ) {
    this.local = local;
    this.nameplateRelation = local ? 'self' : 'neutral';
    this.group = new THREE.Group();

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

    const trimColor = styleForCombatRelation(this.nameplateRelation).accentColor;

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

    this.nameSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeCombatNameplateTexture({
          name: this.nameplateName,
          hp: this.nameplateHp,
          relation: this.nameplateRelation
        }),
        transparent: true,
        depthWrite: false
      })
    );
    this.nameSprite.position.y = 2.34;
    this.nameSprite.scale.set(2.16, 0.65, 1);
    this.group.add(this.nameSprite);

    scene.add(this.group);

    this.modelRoot = cloneCharacterScene(gltf.scene);
    this.modelRoot.rotation.y = Math.PI;
    this.group.add(this.modelRoot);

    this.modelRoot.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
      }
    });

    this.mixer = new THREE.AnimationMixer(this.modelRoot);
    for (const clip of gltf.animations) {
      const action = this.mixer.clipAction(clip);
      const isLooping = clip.name === 'reposo' || clip.name === 'Correr';
      action.loop = isLooping ? THREE.LoopRepeat : THREE.LoopOnce;
      action.clampWhenFinished = !isLooping;
      this.actions.set(clip.name, action);
    }

    this.playAnim('reposo');
  }

  update(snapshot: PlayerSnapshot, dt: number, snap = false): void {
    this.target.set(snapshot.x, snapshot.y, snapshot.z);
    if (snap) this.group.position.copy(this.target);
    else this.group.position.lerp(this.target, Math.min(1, dt * 12));

    this.group.rotation.y = snapshot.rotY;

    if (this.mixer) {
      this.mixer.update(dt);
    }

    // Reset model root offset after defeat animation finishes
    if (this.modelRoot && this.currentAction && !this.currentAction.isRunning() && !this.defeatAnimationFinished) {
      if (this.currentAction.getClip().name === 'DerrotaCaida') {
        this.modelRoot.position.set(0, 0, 0);
        this.defeatAnimationFinished = true;
      }
    }

    const animName = ANIM_MAP[snapshot.anim] ?? 'reposo';
    this.playAnim(animName);

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
    if (this.modelRoot) {
      this.modelRoot.visible = !hidden;
    }
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

  private playAnim(name: string): void {
    const action = this.actions.get(name);
    if (!action || action === this.currentAction) return;

    if (name === 'BaileVictoria' || name === 'reposo' || name === 'Correr') {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      action.timeScale = 1;
    } else if (name === 'lanzarmagia') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = 2;
    } else {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = 1;
    }

    if (this.currentAction) {
      this.currentAction.fadeOut(0.15);
    }
    action.reset().fadeIn(0.15).play();
    this.currentAction = action;

    if (name !== 'DerrotaCaida') {
      this.defeatAnimationFinished = false;
    }
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

// Alias for type clarity
export { AnimatedPlayerController as AnimatedRemotePlayerController };

export async function preloadCharacterGltf(characterClass: CharacterClass): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
  const cls = CLASSES[characterClass];
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(assetUrl(cls.modelPath) ?? cls.modelPath);
  return { scene: gltf.scene, animations: gltf.animations };
}

export function cloneCharacterScene(scene: THREE.Group): THREE.Group {
  const clone = cloneSkeleton(scene) as THREE.Group;
  clone.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry = mesh.geometry.clone();
    }
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) {
      mesh.material = material.map((entry) => entry.clone());
    } else if (material) {
      mesh.material = material.clone();
    }
  });
  applyCharacterLighting(clone);
  return clone;
}
