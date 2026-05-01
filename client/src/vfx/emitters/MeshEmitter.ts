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
    } else if (matDef.type === 'shader') {
      this.material = this.createVortexShaderMaterial(matDef, color, side, initialOpacity);
    } else {
      const exhaustive: never = matDef.type;
      throw new Error(`Material type "${exhaustive}" not yet implemented in MeshEmitter`);
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

    this.updateShaderTime(elapsed);

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
      this.setMaterialOpacity(opacity);
    }

    const matDef = this.layer.material;
    if (matDef.opacity && typeof matDef.opacity !== 'number' && this.material) {
      const val = this.evaluateAnimatedValue(matDef.opacity, elapsed, duration);
      const opacity = typeof val === 'number' ? val : val[0];
      this.setMaterialOpacity(opacity);
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

  private createVortexShaderMaterial(
    matDef: MeshLayer['material'],
    color: THREE.Color,
    side: THREE.Side,
    opacity: number
  ): THREE.ShaderMaterial {
    const emissive = matDef.emissive ? this.parseColor(matDef.emissive) : color.clone();
    return new THREE.ShaderMaterial({
      transparent: matDef.transparent ?? true,
      depthWrite: false,
      side,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBaseColor: { value: color },
        uEmissiveColor: { value: emissive },
        uOpacity: { value: opacity },
        uIntensity: { value: matDef.emissiveIntensity ?? 1.8 }
      },
      vertexShader: `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uBaseColor;
        uniform vec3 uEmissiveColor;
        uniform float uOpacity;
        uniform float uIntensity;
        varying vec2 vUv;

        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          if (r > 1.0) discard;

          float angle = atan(p.y, p.x);
          float inward = 1.0 - r;
          float spin = angle * 4.0 - r * 11.5 + uTime * 1.35;
          float broadSpin = angle * 2.0 - r * 6.0 + uTime * 0.72;

          float spiral = smoothstep(0.38, 0.98, sin(spin) * 0.5 + 0.5);
          float mist = smoothstep(0.14, 1.0, sin(broadSpin) * 0.5 + 0.5);
          float rim = smoothstep(0.64, 0.9, r) * (1.0 - smoothstep(0.9, 1.0, r));
          float core = smoothstep(0.78, 0.18, r);
          float circle = 1.0 - smoothstep(0.86, 1.0, r);

          float energy = (spiral * 0.72 + mist * 0.26 + core * 0.22 + rim * 0.95) * circle;
          float alpha = clamp(energy * uOpacity, 0.0, 0.95);
          vec3 color = mix(uBaseColor, uEmissiveColor, clamp(spiral + rim, 0.0, 1.0));
          vec3 glow = color * (0.45 + energy * uIntensity);

          gl_FragColor = vec4(glow, alpha);
        }
      `
    });
  }

  private updateShaderTime(elapsed: number): void {
    if (this.material instanceof THREE.ShaderMaterial && this.material.uniforms.uTime) {
      this.material.uniforms.uTime.value = elapsed;
    }
  }

  private setMaterialOpacity(opacity: number): void {
    if (!this.material) return;
    const clamped = Math.max(0, Math.min(1, opacity));
    if (this.material instanceof THREE.ShaderMaterial && this.material.uniforms.uOpacity) {
      this.material.uniforms.uOpacity.value = clamped;
      return;
    }
    const mat = this.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
    if (mat.opacity !== undefined) {
      mat.opacity = clamped;
    }
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
