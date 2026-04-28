import * as THREE from 'three';

const EYE_HEIGHT = 1.58;
const CAMERA_LERP_SPEED = 18;

export class FirstPersonCamera {
  private desired = new THREE.Vector3();
  private look = new THREE.Vector3();

  update(
    camera: THREE.PerspectiveCamera,
    target: THREE.Vector3,
    yaw: number,
    pitch: number,
    dt: number,
    snap = false
  ): void {
    const clampedPitch = clampPitch(pitch);
    const cosPitch = Math.cos(clampedPitch);
    const forward = new THREE.Vector3(
      -Math.sin(yaw) * cosPitch,
      Math.sin(clampedPitch),
      -Math.cos(yaw) * cosPitch
    );

    this.desired.set(target.x, target.y + EYE_HEIGHT, target.z);
    if (snap) {
      camera.position.copy(this.desired);
    } else {
      camera.position.lerp(this.desired, Math.min(1, dt * CAMERA_LERP_SPEED));
    }

    this.look.copy(camera.position).addScaledVector(forward, 10);
    camera.lookAt(this.look);
  }
}

export function clampPitch(value: number): number {
  const maxPitch = THREE.MathUtils.degToRad(62);
  return Math.max(-maxPitch, Math.min(maxPitch, value));
}
