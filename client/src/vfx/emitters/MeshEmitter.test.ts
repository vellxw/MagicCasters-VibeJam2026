import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MeshEmitter } from './MeshEmitter';
import type { MeshLayer } from '../types';

describe('MeshEmitter shader material', () => {
  it('creates a vortex shader material and advances time uniforms', () => {
    const layer: MeshLayer = {
      type: 'mesh',
      geometry: { type: 'plane', params: [3, 3] },
      material: {
        type: 'shader',
        color: '#7dd3fc',
        emissive: '#22d3ee',
        transparent: true,
        opacity: 0.8,
        side: 'double'
      }
    };
    const parent = new THREE.Group();
    const emitter = new MeshEmitter(layer);

    expect(() => emitter.init(parent)).not.toThrow();

    const mesh = parent.children[0] as THREE.Mesh;
    expect(mesh.material).toBeInstanceOf(THREE.ShaderMaterial);

    const material = mesh.material as THREE.ShaderMaterial;
    expect(material.uniforms.uTime.value).toBe(0);
    expect(material.uniforms.uBaseColor.value).toBeInstanceOf(THREE.Color);
    expect(material.uniforms.uEmissiveColor.value).toBeInstanceOf(THREE.Color);

    emitter.update(0.2, 1.25, 0);
    expect(material.uniforms.uTime.value).toBe(1.25);
    expect(material.uniforms.uOpacity.value).toBe(0.8);
  });
});
