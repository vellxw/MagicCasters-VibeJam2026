import type * as THREE from 'three';
import type { SplatArenaPreset, SplatCalibrationSettings } from './ArenaPreset';

const PLAYCANVAS_MODULE_URL = 'https://cdn.jsdelivr.net/npm/playcanvas@2.18.0/+esm';

interface PlayCanvasModule {
  Application: new (canvas: HTMLCanvasElement, options?: Record<string, unknown>) => any;
  Asset: new (name: string, type: string, file: { url: string }) => any;
  AssetListLoader: new (assets: any[], registry: any) => { load: (callback: (err?: unknown) => void) => void };
  Color: new (r: number, g: number, b: number, a?: number) => any;
  Entity: new (name?: string) => any;
  FILLMODE_FILL_WINDOW: string;
  RESOLUTION_AUTO: string;
  Quat: new (x?: number, y?: number, z?: number, w?: number) => any;
}

export interface PlayCanvasSplatLayer {
  updateFromThreeCamera(camera: THREE.PerspectiveCamera): void;
  updateTransform(transform: Pick<SplatCalibrationSettings, 'scale' | 'rotation' | 'offset'>): void;
  dispose(): void;
}

export async function createPlayCanvasSplatLayer(args: {
  container: HTMLElement;
  camera: THREE.PerspectiveCamera;
  preset: SplatArenaPreset;
}): Promise<PlayCanvasSplatLayer> {
  const pc = await import(/* @vite-ignore */ PLAYCANVAS_MODULE_URL) as PlayCanvasModule;
  const canvas = document.createElement('canvas');
  canvas.className = 'splat-canvas';
  args.container.insertBefore(canvas, args.container.firstChild);

  const app = new pc.Application(canvas, {
    graphicsDeviceOptions: {
      alpha: true,
      antialias: false
    }
  });
  app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.start();

  const cameraEntity = new pc.Entity('Splat Camera');
  cameraEntity.addComponent('camera', {
    clearColor: new pc.Color(0, 0, 0, 0),
    fov: args.camera.fov,
    nearClip: args.camera.near,
    farClip: args.camera.far
  });
  app.root.addChild(cameraEntity);

  const asset = new pc.Asset(args.preset.displayName, 'gsplat', { url: args.preset.splatUrl });
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Splat asset load timed out')), 20000);
    const loader = new pc.AssetListLoader([asset], app.assets);
    loader.load((err?: unknown) => {
      window.clearTimeout(timeout);
      if (err) reject(err);
      else resolve();
    });
  });

  const splat = new pc.Entity(args.preset.displayName);
  applySplatTransform(splat, args.preset);
  splat.addComponent('gsplat', { asset });
  app.root.addChild(splat);

  const quat = new pc.Quat();
  const resize = () => app.resizeCanvas();
  window.addEventListener('resize', resize);

  const layer: PlayCanvasSplatLayer = {
    updateFromThreeCamera(camera) {
      cameraEntity.setPosition(camera.position.x, camera.position.y, camera.position.z);
      quat.set(camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w);
      cameraEntity.setRotation(quat);
      if (cameraEntity.camera) {
        cameraEntity.camera.fov = camera.fov;
        cameraEntity.camera.nearClip = camera.near;
        cameraEntity.camera.farClip = camera.far;
      }
    },
    updateTransform(transform) {
      applySplatTransform(splat, transform);
    },
    dispose() {
      window.removeEventListener('resize', resize);
      app.destroy();
      canvas.remove();
    }
  };

  layer.updateFromThreeCamera(args.camera);
  return layer;
}

function applySplatTransform(
  splat: any,
  transform: Pick<SplatCalibrationSettings, 'scale' | 'rotation' | 'offset'>
): void {
  splat.setLocalScale(transform.scale, transform.scale, transform.scale);
  splat.setEulerAngles(transform.rotation.x, transform.rotation.y, transform.rotation.z);
  splat.setPosition(transform.offset.x, transform.offset.y, transform.offset.z);
}
