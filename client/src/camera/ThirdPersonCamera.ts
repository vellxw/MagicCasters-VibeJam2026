import * as THREE from 'three';

export class ThirdPersonCamera {
  private desired = new THREE.Vector3();
  private look = new THREE.Vector3();

  update(camera: THREE.PerspectiveCamera, target: THREE.Vector3, rotY: number, dt: number): void {
    const forward = new THREE.Vector3(-Math.sin(rotY), 0, -Math.cos(rotY));
    const right = new THREE.Vector3(Math.cos(rotY), 0, -Math.sin(rotY));

    this.desired.copy(target);
    this.desired.addScaledVector(forward, -6);
    this.desired.addScaledVector(right, 1.2);
    this.desired.y += 4.1;

    camera.position.lerp(this.desired, Math.min(1, dt * 7));
    this.look.copy(target);
    this.look.y += 1.2;
    this.look.addScaledVector(forward, 4);
    camera.lookAt(this.look);
  }
}
