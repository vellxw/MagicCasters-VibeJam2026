import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { PotionType, PublicPotionState } from '../../../shared/types';
import { assetUrl } from '../world/AssetUrls';

export interface PotionCollectedVisualEvent {
  type: PotionType;
  x: number;
  y: number;
  z: number;
}

interface PotionRenderEntry {
  root: THREE.Group;
  visual: THREE.Object3D;
  snapshot: PublicPotionState;
  age: number;
}

interface PulseEntry {
  root: THREE.Group;
  material: THREE.MeshBasicMaterial;
  age: number;
}

const POTION_MODEL_PATHS: Record<PotionType, string> = {
  health: '/models/potions/health-potion.glb',
  mana: '/models/potions/mana-potion.glb'
};

const POTION_COLORS: Record<PotionType, { liquid: number; glow: number }> = {
  health: { liquid: 0xff3f28, glow: 0xff6a30 },
  mana: { liquid: 0x2f68ff, glow: 0x5aa7ff }
};

export class PotionRenderer {
  private entries = new Map<string, PotionRenderEntry>();
  private pulses: PulseEntry[] = [];
  private loadedModels = new Map<PotionType, THREE.Object3D>();

  constructor(private scene: THREE.Object3D) {}

  async preload(): Promise<void> {
    const loader = new GLTFLoader();
    await Promise.all(
      (Object.keys(POTION_MODEL_PATHS) as PotionType[]).map(async (type) => {
        try {
          const gltf = await loader.loadAsync(assetUrl(POTION_MODEL_PATHS[type]) ?? POTION_MODEL_PATHS[type]);
          this.loadedModels.set(type, gltf.scene);
        } catch {
          // The procedural fallback keeps gameplay readable if an asset is missing.
        }
      })
    );
  }

  sync(potions: PublicPotionState[]): void {
    const activeIds = new Set<string>();

    for (const potion of potions) {
      activeIds.add(potion.id);
      let entry = this.entries.get(potion.id);
      if (!entry) {
        entry = this.createEntry(potion);
        this.entries.set(potion.id, entry);
        this.scene.add(entry.root);
      }

      entry.snapshot = potion;
      entry.root.position.set(potion.x, potion.y, potion.z);
      if (potion.state === 'falling') {
        entry.visual.position.y = 0;
      }
    }

    for (const [id, entry] of this.entries) {
      if (!activeIds.has(id)) {
        this.scene.remove(entry.root);
        disposeObject(entry.root);
        this.entries.delete(id);
      }
    }
  }

  update(dt: number): void {
    for (const entry of this.entries.values()) {
      entry.age += dt;
      entry.visual.rotation.y += dt * 1.8;
      if (entry.snapshot.state === 'grounded') {
        entry.visual.position.y = 0.16 + Math.sin(entry.age * 4.5) * 0.08;
      }
    }

    for (const pulse of [...this.pulses]) {
      pulse.age += dt;
      const progress = Math.min(1, pulse.age / 0.8);
      pulse.root.scale.setScalar(1 + progress * 1.4);
      pulse.material.opacity = 0.52 * (1 - progress);
      if (progress >= 1) {
        this.scene.remove(pulse.root);
        disposeObject(pulse.root);
        this.pulses.splice(this.pulses.indexOf(pulse), 1);
      }
    }
  }

  playCollected(event: PotionCollectedVisualEvent): void {
    const color = POTION_COLORS[event.type].glow;
    const root = new THREE.Group();
    root.position.set(event.x, event.y + 0.08, event.z);

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.52,
      depthWrite: false
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.026, 8, 42), material);
    ring.rotation.x = Math.PI / 2;
    root.add(ring);

    this.scene.add(root);
    this.pulses.push({ root, material, age: 0 });
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      this.scene.remove(entry.root);
      disposeObject(entry.root);
    }
    this.entries.clear();

    for (const pulse of this.pulses) {
      this.scene.remove(pulse.root);
      disposeObject(pulse.root);
    }
    this.pulses = [];
  }

  private createEntry(potion: PublicPotionState): PotionRenderEntry {
    const root = new THREE.Group();
    const loaded = this.loadedModels.get(potion.type);
    const visual = loaded ? loaded.clone(true) : createFallbackPotion(potion.type);
    root.add(visual);
    root.position.set(potion.x, potion.y, potion.z);
    return { root, visual, snapshot: potion, age: 0 };
  }
}

function createFallbackPotion(type: PotionType): THREE.Object3D {
  const colors = POTION_COLORS[type];
  const root = new THREE.Group();
  root.scale.setScalar(0.78);

  const liquid = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 18, 12),
    new THREE.MeshStandardMaterial({
      color: colors.liquid,
      emissive: colors.glow,
      emissiveIntensity: 0.85,
      roughness: 0.22,
      metalness: 0.02
    })
  );
  liquid.scale.set(0.95, 1.12, 0.95);
  liquid.position.y = 0.48;
  root.add(liquid);

  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.34, 0.92, 6, 1),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.34,
      roughness: 0.05,
      metalness: 0,
      transmission: 0.35,
      thickness: 0.12
    })
  );
  glass.position.y = 0.52;
  root.add(glass);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.18, 0.42, 12),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.42,
      roughness: 0.08,
      transmission: 0.24
    })
  );
  neck.position.y = 1.14;
  root.add(neck);

  const cork = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.19, 0.26, 14),
    new THREE.MeshStandardMaterial({ color: 0xb9814b, roughness: 0.8 })
  );
  cork.position.y = 1.48;
  root.add(cork);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.018, 6, 40),
    new THREE.MeshBasicMaterial({
      color: colors.glow,
      transparent: true,
      opacity: 0.58,
      depthWrite: false
    })
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.02;
  root.add(halo);

  return root;
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material?.dispose?.();
    }
  });
}
