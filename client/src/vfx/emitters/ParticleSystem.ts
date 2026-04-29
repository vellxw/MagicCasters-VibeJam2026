import * as THREE from 'three';

interface Particle {
  active: boolean;
  life: number;
  maxLife: number;
  velocity: THREE.Vector3;
}

interface ParticleSystemOptions {
  maxCount: number;
  colorStart: THREE.Color;
  colorEnd: THREE.Color;
  sizeStart: number;
  sizeEnd: number;
  opacityStart: number;
  opacityEnd: number;
  gravity?: THREE.Vector3;
  drag?: number;
}

export class ParticleSystem {
  private pool: THREE.Mesh[] = [];
  private particles: Particle[] = [];
  private group: THREE.Group;
  private maxCount: number;
  private geometry: THREE.PlaneGeometry;
  private baseMaterial: THREE.MeshBasicMaterial;
  private colorStart: THREE.Color;
  private colorEnd: THREE.Color;
  private sizeStart: number;
  private sizeEnd: number;
  private opacityStart: number;
  private opacityEnd: number;
  private gravity: THREE.Vector3;
  private drag: number;
  private camera: THREE.Camera | null = null;

  constructor(parent: THREE.Group, options: ParticleSystemOptions, camera?: THREE.Camera | null) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.maxCount = options.maxCount;
    this.colorStart = options.colorStart;
    this.colorEnd = options.colorEnd;
    this.sizeStart = options.sizeStart;
    this.sizeEnd = options.sizeEnd;
    this.opacityStart = options.opacityStart;
    this.opacityEnd = options.opacityEnd;
    this.gravity = options.gravity ?? new THREE.Vector3(0, 0, 0);
    this.drag = options.drag ?? 0;
    this.camera = camera ?? null;

    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.baseMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    for (let i = 0; i < this.maxCount; i++) {
      const mesh = new THREE.Mesh(this.geometry, this.baseMaterial.clone());
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push(mesh);
      this.particles.push({ active: false, life: 0, maxLife: 0, velocity: new THREE.Vector3() });
    }
  }

  emit(
    count: number,
    position: THREE.Vector3,
    velocityBase: THREE.Vector3,
    spread: number,
    radial: boolean,
    lifetimeMin: number,
    lifetimeMax: number
  ): void {
    let emitted = 0;
    for (let i = 0; i < this.maxCount && emitted < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.life = 0;
        p.maxLife = lifetimeMin + Math.random() * (lifetimeMax - lifetimeMin);
        p.velocity.copy(velocityBase);
        if (spread > 0) {
          p.velocity.x += (Math.random() - 0.5) * spread;
          p.velocity.y += (Math.random() - 0.5) * spread;
          p.velocity.z += (Math.random() - 0.5) * spread;
        }
        if (radial) {
          p.velocity.add(new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
          ).normalize().multiplyScalar(velocityBase.length()));
        }
        this.pool[i].position.copy(position);
        this.pool[i].visible = true;
        emitted++;
      }
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.maxCount; i++) {
      const p = this.particles[i];
      const mesh = this.pool[i];
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        mesh.visible = false;
        continue;
      }

      const t = p.life / p.maxLife;

      p.velocity.addScaledVector(this.gravity, dt);
      p.velocity.multiplyScalar(Math.max(0, 1 - this.drag * dt));
      mesh.position.addScaledVector(p.velocity, dt);

      if (this.camera) {
        mesh.lookAt(this.camera.position);
      }

      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.copy(this.colorStart).lerp(this.colorEnd, t);
      const size = THREE.MathUtils.lerp(this.sizeStart, this.sizeEnd, t);
      mesh.scale.setScalar(size);
      mat.opacity = THREE.MathUtils.lerp(this.opacityStart, this.opacityEnd, t);
    }
  }

  dispose(): void {
    for (const mesh of this.pool) {
      (mesh.material as THREE.Material).dispose();
    }
    this.geometry.dispose();
    this.baseMaterial.dispose();
    this.group.removeFromParent();
  }
}
