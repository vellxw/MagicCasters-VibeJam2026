import * as THREE from 'three';
import { ARENA_BOUNDS } from '../../../shared/types';

export function buildArena(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b241a,
    roughness: 0.72,
    metalness: 0.08
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(19, 15), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0x9a5b2a,
    roughness: 0.5,
    emissive: 0x2d1406,
    emissiveIntensity: 0.4
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.35, 80), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  group.add(ring);

  const boundaryMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b2f25,
    roughness: 0.62
  });

  const width = ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX;
  const depth = ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ;
  const wallData = [
    { x: 0, z: ARENA_BOUNDS.minZ - 0.2, w: width + 1, d: 0.4 },
    { x: 0, z: ARENA_BOUNDS.maxZ + 0.2, w: width + 1, d: 0.4 },
    { x: ARENA_BOUNDS.minX - 0.2, z: 0, w: 0.4, d: depth + 1 },
    { x: ARENA_BOUNDS.maxX + 0.2, z: 0, w: 0.4, d: depth + 1 }
  ];

  for (const wall of wallData) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.w, 0.6, wall.d), boundaryMaterial);
    mesh.position.set(wall.x, 0.3, wall.z);
    mesh.castShadow = true;
    group.add(mesh);
  }

  const pillarMaterial = new THREE.MeshStandardMaterial({
    color: 0x536c50,
    roughness: 0.45,
    emissive: 0x162413,
    emissiveIntensity: 0.45
  });

  for (const [x, z] of [[-3.4, -2.4], [3.4, 2.4], [-3.4, 2.4], [3.4, -2.4]]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 1.5, 8), pillarMaterial);
    pillar.position.set(x, 0.75, z);
    pillar.castShadow = true;
    group.add(pillar);
  }

  scene.add(group);
  return group;
}
