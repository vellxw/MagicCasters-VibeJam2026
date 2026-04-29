import * as THREE from 'three';
import { BaseEmitter } from './BaseEmitter';
import type { TrailLayer } from '../types';

export class TrailEmitter extends BaseEmitter {
  private mesh: THREE.Mesh | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.MeshBasicMaterial | null = null;
  private positions: THREE.Vector3[] = [];
  private layer: TrailLayer;
  private maxLength: number;
  private fadeTime: number;

  constructor(layer: TrailLayer) {
    super();
    this.layer = layer;
    this.maxLength = layer.length;
    this.fadeTime = layer.fadeTime;
  }

  init(parent: THREE.Group): void {
    this.parent = parent;
    const color = typeof this.layer.color === 'string' ? new THREE.Color(this.layer.color) : new THREE.Color(this.layer.color.start);
    this.material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((this.maxLength + 1) * 3);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    // Use a simple line-like mesh with very thin plane segments or just points
    // For robustness, use Points instead of Line to avoid linewidth issues
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    parent.add(this.mesh);
  }

  update(_dt: number, elapsed: number, _duration: number): void {
    if (!this.mesh || !this.parent) return;

    this.positions.unshift(new THREE.Vector3(0, 0, 0));
    if (this.positions.length > this.maxLength) {
      this.positions.pop();
    }

    const posArray = this.geometry!.attributes.position.array as Float32Array;
    for (let i = 0; i < this.maxLength + 1; i++) {
      if (i < this.positions.length) {
        posArray[i * 3] = this.positions[i].x;
        posArray[i * 3 + 1] = this.positions[i].y;
        posArray[i * 3 + 2] = this.positions[i].z;
      } else {
        posArray[i * 3] = 0;
        posArray[i * 3 + 1] = 0;
        posArray[i * 3 + 2] = 0;
      }
    }
    this.geometry!.attributes.position.needsUpdate = true;

    const t = this.fadeTime > 0 ? Math.min(1, elapsed / this.fadeTime) : 1;
    this.material!.opacity = Math.max(0, 1 - t);
  }

  dispose(): void {
    if (this.mesh) {
      this.parent?.remove(this.mesh);
      this.geometry?.dispose();
      this.material?.dispose();
    }
    this.mesh = null;
  }
}
