import * as THREE from 'three';
import { BaseEmitter } from './BaseEmitter';
import type { MeshLayer, AnimatedValue, CurveType, VfxColor } from '../types';

export class MeshEmitter extends BaseEmitter {
  private mesh: THREE.Mesh | null = null;
  private material: THREE.Material | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private layer: MeshLayer;
  private baseScale: THREE.Vector3;
  private startTime = 0;
  private cachedAxis: THREE.Vector3 | null = null;

  constructor(layer: MeshLayer) {
    super();
    this.layer = layer;
    this.baseScale = new THREE.Vector3(1, 1, 1);
  }

  init(parent: THREE.Group): void {
    this.parent = parent;
    this.startTime = performance.now() / 1000;

    const geoDef = this.layer.geometry;
    const p = geoDef.params;
    switch (geoDef.type) {
      case 'sphere': this.geometry = new THREE.SphereGeometry(p[0], p[1] ?? 8, p[2] ?? 8); break;
      case 'box': this.geometry = new THREE.BoxGeometry(p[0], p[1], p[2]); break;
      case 'cylinder': this.geometry = new THREE.CylinderGeometry(p[0], p[1], p[2], p[3] ?? 8); break;
      case 'torus': this.geometry = new THREE.TorusGeometry(p[0], p[1], p[2] ?? 8, p[3] ?? 24); break;
      case 'ring': this.geometry = new THREE.RingGeometry(p[0], p[1], p[2] ?? 32); break;
      case 'icosahedron': this.geometry = new THREE.IcosahedronGeometry(p[0], p[1] ?? 0); break;
      case 'plane': this.geometry = new THREE.PlaneGeometry(p[0], p[1]); break;
      default: {
        const exhaustive: never = geoDef.type;
        throw new Error(`Unknown geometry type: ${exhaustive}`);
      }
    }

    const matDef = this.layer.material;
    const color = this.parseColor(matDef.color);
    const side = matDef.side === 'double' ? THREE.DoubleSide : matDef.side === 'back' ? THREE.BackSide : THREE.FrontSide;

    const initialOpacity = typeof matDef.opacity === 'number' ? matDef.opacity : 1;

    if (matDef.type === 'basic') {
      this.material = new THREE.MeshBasicMaterial({
        color,
        side,
        transparent: matDef.transparent ?? false,
        opacity: initialOpacity,
        wireframe: matDef.wireframe ?? false
      });
    } else if (matDef.type === 'standard') {
      const emissive = matDef.emissive ? this.parseColor(matDef.emissive) : new THREE.Color(0x000000);
      this.material = new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: matDef.emissiveIntensity ?? 1,
        roughness: matDef.roughness ?? 0.5,
        metalness: matDef.metalness ?? 0,
        side,
        transparent: matDef.transparent ?? false,
        opacity: initialOpacity,
        wireframe: matDef.wireframe ?? false
      });
    } else {
      throw new Error(`Material type "${matDef.type}" not yet implemented in MeshEmitter`);
    }

    this.mesh = new THREE.Mesh(this.geometry, this.material);

    if (this.layer.position) {
      this.mesh.position.set(...this.layer.position);
    }
    if (this.layer.rotation) {
      this.mesh.rotation.set(...this.layer.rotation);
    }
    if (this.layer.scale) {
      const s = this.layer.scale;
      if (typeof s === 'number') {
        this.mesh.scale.setScalar(s);
        this.baseScale.setScalar(s);
      } else if (Array.isArray(s)) {
        this.mesh.scale.set(s[0], s[1], s[2]);
        this.baseScale.set(s[0], s[1], s[2]);
      }
    }

    parent.add(this.mesh);
  }

  update(dt: number, elapsed: number, duration: number): void {
    if (!this.mesh) return;

    const anim = this.layer.animation;
    if (!anim) return;

    if (anim.rotation?.speed) {
      const s = anim.rotation.speed;
      this.mesh.rotation.x += s[0] * dt;
      this.mesh.rotation.y += s[1] * dt;
      this.mesh.rotation.z += s[2] * dt;
    }

    if (anim.rotation?.axis && anim.rotation.angle) {
      if (!this.cachedAxis) {
        this.cachedAxis = new THREE.Vector3(...anim.rotation.axis).normalize();
      }
      const angleVal = this.evaluateAnimatedValue(anim.rotation.angle, elapsed, duration);
      const angle = typeof angleVal === 'number' ? angleVal : angleVal[0];
      this.mesh.rotateOnAxis(this.cachedAxis, angle * dt);
    }

    if (anim.scale && typeof this.layer.scale !== 'number' && !Array.isArray(this.layer.scale)) {
      const val = this.evaluateAnimatedValue(anim.scale, elapsed, duration);
      const s = typeof val === 'number' ? val : val[0];
      this.mesh.scale.copy(this.baseScale).multiplyScalar(s);
    }

    if (anim.opacity && this.material) {
      const val = this.evaluateAnimatedValue(anim.opacity, elapsed, duration);
      const opacity = typeof val === 'number' ? val : val[0];
      const mat = this.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
      if (mat.opacity !== undefined) {
        mat.opacity = Math.max(0, Math.min(1, opacity));
      }
    }

    const matDef = this.layer.material;
    if (matDef.opacity && typeof matDef.opacity !== 'number' && this.material) {
      const val = this.evaluateAnimatedValue(matDef.opacity, elapsed, duration);
      const opacity = typeof val === 'number' ? val : val[0];
      const mat = this.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
      if (mat.opacity !== undefined) {
        mat.opacity = Math.max(0, Math.min(1, opacity));
      }
    }
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry?.dispose();
      if (Array.isArray(this.mesh.material)) {
        this.mesh.material.forEach((m) => m.dispose());
      } else {
        this.mesh.material?.dispose();
      }
      this.parent?.remove(this.mesh);
    }
    this.mesh = null;
    this.material = null;
    this.geometry = null;
  }

  private parseColor(color: VfxColor): THREE.Color {
    if (typeof color === 'string') return new THREE.Color(color);
    return new THREE.Color(color.start);
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
