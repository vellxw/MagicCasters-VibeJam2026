import * as THREE from 'three';
import { BaseEmitter } from './BaseEmitter';
import { ParticleSystem } from './ParticleSystem';
import type { ParticleLayer } from '../types';

export class ParticleEmitter extends BaseEmitter {
  private system: ParticleSystem | null = null;
  private layer: ParticleLayer;
  private emissionAccumulator = 0;
  private emittedAll = false;

  constructor(layer: ParticleLayer) {
    super();
    this.layer = layer;
  }

  init(parent: THREE.Group, camera?: THREE.Camera | null): void {
    this.parent = parent;
    const colorStart = new THREE.Color(this.layer.color.start);
    const colorEnd = new THREE.Color(this.layer.color.end);
    this.system = new ParticleSystem(parent, {
      maxCount: this.layer.count,
      colorStart,
      colorEnd,
      sizeStart: this.layer.size.start,
      sizeEnd: this.layer.size.end,
      opacityStart: this.layer.opacity.start,
      opacityEnd: this.layer.opacity.end,
      gravity: this.layer.gravity ? new THREE.Vector3(...this.layer.gravity) : new THREE.Vector3(0, 0, 0),
      drag: this.layer.drag ?? 0
    }, camera);
  }

  update(dt: number, _elapsed: number, _duration: number): void {
    if (!this.system) return;

    if (this.layer.burst) {
      if (!this.emittedAll) {
        this.emit(this.layer.count);
        this.emittedAll = true;
      }
    } else {
      this.emissionAccumulator += dt;
      const interval = 1 / this.layer.emissionRate;
      while (this.emissionAccumulator >= interval) {
        this.emissionAccumulator -= interval;
        this.emit(1);
      }
    }

    this.system.update(dt);
  }

  private emit(count: number): void {
    if (!this.system) return;
    const pos = new THREE.Vector3(0, 0, 0);

    if (this.layer.emissionShape === 'sphere' && this.layer.emissionShapeParams) {
      const r = this.layer.emissionShapeParams[0];
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos.x = r * Math.sin(phi) * Math.cos(theta);
      pos.y = r * Math.sin(phi) * Math.sin(theta);
      pos.z = r * Math.cos(phi);
    } else if (this.layer.emissionShape === 'disc' && this.layer.emissionShapeParams) {
      const r = this.layer.emissionShapeParams[0] * Math.sqrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      pos.x = r * Math.cos(theta);
      pos.z = r * Math.sin(theta);
    } else if (this.layer.emissionShape === 'cone' && this.layer.emissionShapeParams) {
      const angle = this.layer.emissionShapeParams[0];
      const r = this.layer.emissionShapeParams[1] ?? 1;
      const theta = Math.random() * Math.PI * 2;
      const dist = Math.random() * r;
      pos.x = dist * Math.cos(theta) * Math.sin(angle);
      pos.z = dist * Math.sin(theta) * Math.sin(angle);
      pos.y = dist * Math.cos(angle);
    }

    const vel = new THREE.Vector3(...this.layer.velocity.initial);
    const spread = this.layer.velocity.spread;
    const radial = this.layer.velocity.radial ?? false;

    this.system.emit(count, pos, vel, spread, radial, this.layer.lifetime.min, this.layer.lifetime.max);
  }

  dispose(): void {
    this.system?.dispose();
    this.system = null;
  }
}
