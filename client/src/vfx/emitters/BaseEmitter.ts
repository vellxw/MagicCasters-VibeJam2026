import * as THREE from 'three';

export abstract class BaseEmitter {
  protected parent: THREE.Group | null = null;
  protected disposed = false;
  protected camera: THREE.Camera | null = null;

  abstract init(parent: THREE.Group, camera?: THREE.Camera | null): void;
  abstract update(dt: number, elapsed: number, duration: number): void;
  abstract dispose(): void;

  setVisible(visible: boolean): void {
    if (this.parent) {
      this.parent.traverse((child) => {
        if ((child as THREE.Mesh).material) {
          child.visible = visible;
        }
      });
    }
  }
}
