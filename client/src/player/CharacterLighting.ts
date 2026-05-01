import * as THREE from 'three';

const READABILITY_TARGET_LUMINANCE = 0.44;
const MIN_EMISSIVE_INTENSITY = 0.06;
const MAX_EMISSIVE_INTENSITY = 0.28;
const WARM_FILL = new THREE.Color(0xffe3bd);

type LightableMaterial = THREE.Material & {
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
};

export function applyCharacterLighting(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (isLightableMaterial(material)) {
        liftDarkMaterial(material);
      }
    }
  });
}

function liftDarkMaterial(material: LightableMaterial): void {
  const luminance = colorLuminance(material.color);
  if (luminance >= READABILITY_TARGET_LUMINANCE) return;

  const lift = THREE.MathUtils.clamp(
    (READABILITY_TARGET_LUMINANCE - luminance) / READABILITY_TARGET_LUMINANCE,
    0,
    1
  );
  const fillColor = material.color.clone().lerp(WARM_FILL, 0.42);
  const liftedIntensity = THREE.MathUtils.lerp(MIN_EMISSIVE_INTENSITY, MAX_EMISSIVE_INTENSITY, lift);

  material.emissive.lerp(fillColor, Math.max(0.5, lift));
  material.emissiveIntensity = Math.max(material.emissiveIntensity, liftedIntensity);
  material.needsUpdate = true;
}

function colorLuminance(color: THREE.Color): number {
  return color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
}

function isLightableMaterial(material: THREE.Material): material is LightableMaterial {
  const maybe = material as Partial<LightableMaterial>;
  return maybe.color instanceof THREE.Color && maybe.emissive instanceof THREE.Color;
}
