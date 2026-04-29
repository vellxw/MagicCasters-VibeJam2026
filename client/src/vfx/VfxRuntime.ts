import * as THREE from 'three';
import { VfxLibrary } from './VfxLibrary';
import { VfxLoader } from './VfxLoader';
import type { VfxDefinition, VfxInstance, AttachPoint } from './types';
import { BaseEmitter } from './emitters/BaseEmitter';
import { MeshEmitter } from './emitters/MeshEmitter';
import { LightEmitter } from './emitters/LightEmitter';
import { ParticleEmitter } from './emitters/ParticleEmitter';
import { TrailEmitter } from './emitters/TrailEmitter';

interface PlayOptions {
  attachTo?: AttachPoint;
  targetObject?: THREE.Object3D;
  position?: THREE.Vector3;
  rotation?: THREE.Euler;
  loop?: boolean;
  speed?: number;
}

export class VfxRuntime {
  private instances = new Map<string, VfxInstance>();
  private tempPos = new THREE.Vector3();
  private tempQuat = new THREE.Quaternion();
  private camera: THREE.Camera | null = null;

  constructor(
    private scene: THREE.Scene,
    private library: VfxLibrary,
    private loader: VfxLoader
  ) {}

  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  async preload(ids: string[]): Promise<void> {
    await Promise.all(
      ids.map(async (id) => {
        try {
          const def = await this.loader.loadDefinition(id);
          this.library.register(def);
        } catch (err) {
          console.warn(`[VfxRuntime] Failed to preload "${id}":`, err);
        }
      })
    );
  }

  async preloadFromIndex(): Promise<void> {
    try {
      const defs = await this.loader.loadAllFromIndex();
      for (const def of defs) {
        this.library.register(def);
      }
    } catch (err) {
      console.warn('[VfxRuntime] Failed to preload from index:', err);
    }
  }

  play(definitionId: string, options?: PlayOptions): string {
    const definition = this.library.getDefinition(definitionId);
    if (!definition) {
      throw new Error(`VFX definition "${definitionId}" not found in library. Did you forget to preload?`);
    }

    const group = new THREE.Group();
    if (options?.position) {
      group.position.copy(options.position);
    }
    if (options?.rotation) {
      group.rotation.copy(options.rotation);
    }
    this.scene.add(group);

    const emitters = this.createEmitters(definition);
    for (const emitter of emitters) {
      emitter.init(group, this.camera);
    }

    const instanceId = THREE.MathUtils.generateUUID();

    const instance: VfxInstance = {
      id: instanceId,
      definitionId,
      definition,
      group,
      startTime: performance.now() / 1000,
      elapsed: 0,
      loop: options?.loop ?? definition.loop,
      attachTo: options?.attachTo ?? definition.attachTo,
      targetObject: options?.targetObject,
      emitters
    };

    this.instances.set(instanceId, instance);
    return instanceId;
  }

  stop(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    for (const emitter of instance.emitters) {
      emitter.dispose();
    }
    this.scene.remove(instance.group);
    this.instances.delete(instanceId);
  }

  stopAll(): void {
    for (const id of Array.from(this.instances.keys())) {
      this.stop(id);
    }
  }

  update(dt: number): void {
    const instances = Array.from(this.instances.values());
    for (const instance of instances) {
      instance.elapsed += dt;

      if (instance.attachTo && instance.attachTo !== 'world' && instance.targetObject) {
        instance.targetObject.getWorldPosition(this.tempPos);
        instance.targetObject.getWorldQuaternion(this.tempQuat);
        instance.group.position.copy(this.tempPos);
        instance.group.quaternion.copy(this.tempQuat);
      }

      for (const emitter of instance.emitters) {
        emitter.update(dt, instance.elapsed, instance.definition.duration);
      }

      if (instance.definition.duration > 0 && instance.elapsed >= instance.definition.duration) {
        if (instance.loop) {
          instance.elapsed = instance.elapsed % instance.definition.duration;
        } else {
          this.stop(instance.id);
        }
      }
    }
  }

  getInstance(instanceId: string): VfxInstance | undefined {
    return this.instances.get(instanceId);
  }

  setInstancePosition(instanceId: string, position: THREE.Vector3): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.group.position.copy(position);
    }
  }

  private createEmitters(definition: VfxDefinition): BaseEmitter[] {
    const emitters: BaseEmitter[] = [];
    for (const layer of definition.layers) {
      switch (layer.type) {
        case 'mesh':
          emitters.push(new MeshEmitter(layer));
          break;
        case 'light':
          emitters.push(new LightEmitter(layer));
          break;
        case 'particles':
          emitters.push(new ParticleEmitter(layer));
          break;
        case 'trail':
          emitters.push(new TrailEmitter(layer));
          break;
        default: {
          const unknownLayer = layer as Record<string, unknown>;
          console.warn(`[VfxRuntime] Unknown VFX layer type: ${unknownLayer.type}`);
          break;
        }
      }
    }
    return emitters;
  }
}
