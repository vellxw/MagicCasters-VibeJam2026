import * as THREE from 'three';
import { BaseEmitter } from './BaseEmitter';
import type { LightLayer, AnimatedValue, CurveType } from '../types';

export class LightEmitter extends BaseEmitter {
  private light: THREE.PointLight | THREE.SpotLight | null = null;
  private layer: LightLayer;
  private baseIntensity: number;

  constructor(layer: LightLayer) {
    super();
    this.layer = layer;
    this.baseIntensity = typeof layer.intensity === 'number' ? layer.intensity : (layer.intensity.value as number);
  }

  init(parent: THREE.Group): void {
    this.parent = parent;
    const color = typeof this.layer.color === 'string' ? new THREE.Color(this.layer.color) : new THREE.Color(this.layer.color.start);
    const intensity = typeof this.layer.intensity === 'number' ? this.layer.intensity : (this.layer.intensity.value as number);

    if (this.layer.lightType === 'point') {
      this.light = new THREE.PointLight(color, intensity, this.layer.distance, this.layer.decay ?? 2);
    } else {
      this.light = new THREE.SpotLight(color, intensity, this.layer.distance, Math.PI / 6, 0.5, this.layer.decay ?? 2);
    }

    if (this.layer.position) {
      this.light.position.set(...this.layer.position);
    }
    parent.add(this.light);
  }

  update(_dt: number, elapsed: number, duration: number): void {
    if (!this.light) return;

    if (typeof this.layer.intensity !== 'number') {
      const val = this.evaluateAnimatedValue(this.layer.intensity, elapsed, duration);
      const intensity = typeof val === 'number' ? val : val[0];
      this.light.intensity = this.baseIntensity + intensity;
    }
  }

  dispose(): void {
    if (this.light) {
      this.parent?.remove(this.light);
      this.light.dispose();
    }
    this.light = null;
  }

  private evaluateAnimatedValue(animated: AnimatedValue, elapsed: number, duration: number): number | [number, number, number] {
    const delay = animated.delay ?? 0;
    const animDuration = animated.duration ?? duration;
    const rawT = animDuration > 0 ? Math.min(1, Math.max(0, elapsed - delay) / animDuration) : 0;
    const eased = this.applyCurve(rawT, animated.curve ?? 'linear');
    const val = animated.value;
    if (typeof val === 'number') return val * eased;
    return [val[0] * eased, val[1] * eased, val[2] * eased];
  }

  private applyCurve(t: number, curve: CurveType): number {
    switch (curve) {
      case 'linear': return t;
      case 'easeIn': return t * t;
      case 'easeOut': return 1 - (1 - t) * (1 - t);
      case 'easeInOut': return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      case 'sine': return Math.sin(t * Math.PI);
      case 'pulse': return Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
      default: {
        const exhaustive: never = curve;
        return exhaustive;
      }
    }
  }
}
