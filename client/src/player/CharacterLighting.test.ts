import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyCharacterLighting } from './CharacterLighting';

describe('applyCharacterLighting', () => {
  it('adds a subtle emissive lift to dark character materials', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: 0x15100f,
      emissive: 0x000000,
      emissiveIntensity: 0
    });
    const beforeVersion = material.version;
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));

    applyCharacterLighting(root);

    expect(material.emissiveIntensity).toBeGreaterThan(0.1);
    expect(material.emissive.r + material.emissive.g + material.emissive.b).toBeGreaterThan(0);
    expect(material.version).toBeGreaterThan(beforeVersion);
  });

  it('leaves already bright character materials unchanged', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: 0xf0eadc,
      emissive: 0x111111,
      emissiveIntensity: 0.05
    });
    const beforeColor = material.emissive.clone();
    const beforeIntensity = material.emissiveIntensity;
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));

    applyCharacterLighting(root);

    expect(material.emissive.equals(beforeColor)).toBe(true);
    expect(material.emissiveIntensity).toBe(beforeIntensity);
  });
});
