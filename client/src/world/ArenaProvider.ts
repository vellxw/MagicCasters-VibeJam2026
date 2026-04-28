import * as THREE from 'three';
import { DEFAULT_ARENA_ID, SPLAT_TEST_ARENA_ID, type ArenaId } from '../../../shared/types';
import type { ArenaCollisionWall } from '../../../shared/types';
import { buildArena } from './Arena';
import {
  applyCalibrationToPreset,
  loadConfiguredSplatArenaPreset,
  loadSplatArenaPreset,
  type SplatArenaPreset,
  type SplatCalibrationSettings
} from './ArenaPreset';
import { generateAutoCollisionWallsFromObject } from './AutoCollisionGenerator';
import type { PlayCanvasSplatLayer } from './PlayCanvasSplatLayer';
import { loadVoxelCollisionFromUrl } from './VoxelCollisionLoader';
import type { SparseVoxelCollision } from '../../../shared/voxelCollision';

const SPLAT_VISUAL_TIMEOUT_MS = 20000;
const ARENA_CLEAR_COLOR = 0x15120f;

export type SplatLoadStatus = 'idle' | 'loading' | 'loaded' | 'failed' | 'fallback';
export type CollisionStatus = 'none' | 'fallback' | 'loaded';
export type VoxelCollisionStatus = 'none' | 'loading' | 'loaded' | 'failed';
export type OcclusionStatus = 'none' | 'loading' | 'loaded' | 'fallback' | 'failed';

export interface ArenaDebugInfo {
  arenaId: ArenaId;
  splatUrl: string;
  splatLoadStatus: SplatLoadStatus;
  collisionStatus: CollisionStatus;
  occlusionStatus?: OcclusionStatus;
  voxelCollisionStatus?: VoxelCollisionStatus;
  voxelCollisionUrl?: string | null;
  collisionDebugVisible?: boolean;
  scale: number;
  rotation: { x: number; y: number; z: number };
  offset: { x: number; y: number; z: number };
  floorY: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  splatFileSizeBytes?: number;
  collisionWallCount?: number;
  collisionEraserCount?: number;
}

export interface ArenaMountContext {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  shell: HTMLElement;
  camera: THREE.PerspectiveCamera;
  onStatus(message: string): void;
}

export interface ArenaRuntime {
  readonly arenaId: ArenaId;
  update(dt: number): void;
  applyCalibration?(settings: SplatCalibrationSettings): void;
  setCollisionDebugVisible?(visible: boolean): void;
  reloadCollisionProxy?(preset: SplatArenaPreset): Promise<void>;
  generateCollisionWallsFromGuide?(settings: SplatCalibrationSettings): ArenaCollisionWall[];
  getVoxelCollision?(): SparseVoxelCollision | null;
  getDebugInfo(): ArenaDebugInfo | null;
  dispose(): void;
}

export interface SplatArenaProviderOptions {
  preset?: SplatArenaPreset;
  presetUrl?: string;
}

export interface ArenaProvider {
  readonly arenaId: ArenaId;
  mount(context: ArenaMountContext): ArenaRuntime;
}

export function createArenaProvider(arenaId: ArenaId, options: SplatArenaProviderOptions = {}): ArenaProvider {
  return arenaId === SPLAT_TEST_ARENA_ID
    ? new SplatArenaProvider(options)
    : new LightweightArenaProvider();
}

export class LightweightArenaProvider implements ArenaProvider {
  readonly arenaId = DEFAULT_ARENA_ID;

  mount(context: ArenaMountContext): LightweightArenaRuntime {
    return new LightweightArenaRuntime(context.scene);
  }
}

class LightweightArenaRuntime implements ArenaRuntime {
  readonly arenaId = DEFAULT_ARENA_ID;
  readonly group: THREE.Group;

  constructor(private scene: THREE.Scene) {
    this.group = buildArena(scene);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  update(_dt: number): void {
    // The primitive arena is static.
  }

  getDebugInfo(): ArenaDebugInfo | null {
    return null;
  }

  dispose(): void {
    this.scene.remove(this.group);
    disposeObjectTree(this.group);
  }
}

export class SplatArenaProvider implements ArenaProvider {
  readonly arenaId = SPLAT_TEST_ARENA_ID;

  constructor(private options: SplatArenaProviderOptions = {}) {}

  mount(context: ArenaMountContext): ArenaRuntime {
    return new SplatArenaRuntime(context, this.options);
  }
}

class SplatArenaRuntime implements ArenaRuntime {
  readonly arenaId = SPLAT_TEST_ARENA_ID;

  private fallback: LightweightArenaRuntime;
  private splatLayer: PlayCanvasSplatLayer | null = null;
  private collisionProxy: THREE.Group | null = null;
  private occlusionProxy: THREE.Group | null = null;
  private voxelCollision: SparseVoxelCollision | null = null;
  private voxelLoadToken = 0;
  private disposed = false;
  private loadExpired = false;
  private collisionDebugVisible = false;
  private sourcePreset: SplatArenaPreset | null = null;
  private calibrationSettings: SplatCalibrationSettings | null = null;
  private shadowPlane: THREE.Mesh | null = null;
  private debugInfo: ArenaDebugInfo = {
    arenaId: SPLAT_TEST_ARENA_ID,
    splatUrl: 'none',
    splatLoadStatus: 'idle',
    collisionStatus: 'none',
    occlusionStatus: 'none',
    voxelCollisionStatus: 'none',
    voxelCollisionUrl: null,
    collisionDebugVisible: false,
    scale: 1,
    rotation: { x: 0, y: 0, z: 0 },
    offset: { x: 0, y: 0, z: 0 },
    floorY: 0,
    bounds: { minX: -8, maxX: 8, minZ: -6, maxZ: 6 },
    collisionWallCount: 0,
    collisionEraserCount: 0
  };

  constructor(private context: ArenaMountContext, private options: SplatArenaProviderOptions = {}) {
    this.fallback = new LightweightArenaRuntime(context.scene);
    void this.loadInBackground();
  }

  update(_dt: number): void {
    this.splatLayer?.updateFromThreeCamera(this.context.camera);
  }

  getDebugInfo(): ArenaDebugInfo {
    return { ...this.debugInfo };
  }

  applyCalibration(settings: SplatCalibrationSettings): void {
    this.calibrationSettings = cloneCalibrationSettings(settings);
    const activePreset = this.sourcePreset
      ? this.activePreset(this.sourcePreset)
      : {
          presetId: 'splat-test',
          arenaId: SPLAT_TEST_ARENA_ID,
          displayName: 'Realistic Arena Test',
          type: 'splat' as const,
          splatUrl: this.debugInfo.splatUrl,
          collisionMeshUrl: null,
          voxelCollisionUrl: null,
          splatFileSizeBytes: this.debugInfo.splatFileSizeBytes,
          ...this.calibrationSettings
        };
    this.applyPresetDebugInfo(activePreset, this.debugInfo.splatLoadStatus);
    this.splatLayer?.updateTransform(this.calibrationSettings);
    this.updateShadowPlane(activePreset.floorY);
  }

  setCollisionDebugVisible(visible: boolean): void {
    this.collisionDebugVisible = visible;
    this.debugInfo.collisionDebugVisible = visible;
    if (this.collisionProxy) {
      setCollisionProxyDebugVisible(this.collisionProxy, visible);
    }
  }

  async reloadCollisionProxy(preset: SplatArenaPreset): Promise<void> {
    this.disposeCollisionProxies();
    this.debugInfo.collisionStatus = 'none';
    this.debugInfo.occlusionStatus = 'none';
    const activePreset = this.activePreset(preset);
    await Promise.all([
      this.loadCollisionProxy(activePreset),
      this.loadVoxelCollision(activePreset)
    ]);
  }

  generateCollisionWallsFromGuide(settings: SplatCalibrationSettings): ArenaCollisionWall[] {
    if (!this.collisionProxy || this.debugInfo.collisionStatus !== 'loaded') return [];
    return generateAutoCollisionWallsFromObject(this.collisionProxy, settings);
  }

  getVoxelCollision(): SparseVoxelCollision | null {
    return this.voxelCollision;
  }

  dispose(): void {
    this.disposed = true;
    this.splatLayer?.dispose();
    this.splatLayer = null;
    this.fallback.dispose();
    this.disposeCollisionProxies();
    this.disposeShadowPlane();
    this.voxelCollision = null;
    this.voxelLoadToken++;
    this.context.renderer.setClearColor(ARENA_CLEAR_COLOR, 1);
  }

  private updateShadowPlane(floorY: number): void {
    if (!this.shadowPlane) {
      this.shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 40),
        new THREE.ShadowMaterial({ opacity: 0.35 })
      );
      this.shadowPlane.rotation.x = -Math.PI / 2;
      this.shadowPlane.receiveShadow = true;
      this.context.scene.add(this.shadowPlane);
    }
    this.shadowPlane.position.y = floorY + 0.02;
  }

  private disposeShadowPlane(): void {
    if (this.shadowPlane) {
      this.context.scene.remove(this.shadowPlane);
      this.shadowPlane.geometry.dispose();
      (this.shadowPlane.material as THREE.Material).dispose();
      this.shadowPlane = null;
    }
  }

  private async loadInBackground(): Promise<void> {
    let preset: SplatArenaPreset;
    try {
      preset = await this.loadPreset();
      this.sourcePreset = preset;
      preset = this.activePreset(preset);
      this.applyPresetDebugInfo(preset, 'loading');
    } catch (error) {
      this.debugInfo.splatLoadStatus = 'failed';
      this.fallbackToLightweight('Splat preset unavailable; using lightweight arena');
      console.warn(error);
      return;
    }

    void this.loadCollisionProxy(preset);
    void this.loadVoxelCollision(preset);

    const layerPromise = this.createSplatLayer(preset);
    layerPromise.then((lateLayer) => {
      if (this.disposed || this.loadExpired) {
        lateLayer.dispose();
      }
    }).catch(() => undefined);

    try {
      const layer = await withTimeout(layerPromise, SPLAT_VISUAL_TIMEOUT_MS);
      if (this.disposed || this.loadExpired) {
        layer.dispose();
        return;
      }
      this.splatLayer = layer;
      if (this.calibrationSettings) {
        layer.updateTransform(this.calibrationSettings);
      }
      this.debugInfo.splatLoadStatus = 'loaded';
      this.fallback.setVisible(false);
      this.setOcclusionProxyActive(true);
      this.context.renderer.setClearColor(ARENA_CLEAR_COLOR, 0);
      this.context.onStatus(`Realistic arena visual loaded: ${preset.splatUrl}`);
    } catch (error) {
      this.loadExpired = true;
      this.debugInfo.splatLoadStatus = 'failed';
      this.fallbackToLightweight('Splat failed; using lightweight arena fallback');
      console.warn(error);
    }
  }

  private applyPresetDebugInfo(preset: SplatArenaPreset, splatLoadStatus: SplatLoadStatus): void {
    this.debugInfo = {
      arenaId: preset.arenaId,
      splatUrl: preset.splatUrl,
      splatFileSizeBytes: preset.splatFileSizeBytes,
      splatLoadStatus,
      collisionStatus: this.debugInfo.collisionStatus,
      occlusionStatus: this.debugInfo.occlusionStatus ?? 'none',
      voxelCollisionStatus: this.debugInfo.voxelCollisionStatus ?? 'none',
      voxelCollisionUrl: preset.voxelCollisionUrl ?? null,
      collisionDebugVisible: this.debugInfo.collisionDebugVisible,
      scale: preset.scale,
      rotation: { ...preset.rotation },
      offset: { ...preset.offset },
      floorY: preset.floorY,
      bounds: { ...preset.bounds },
      collisionWallCount: preset.collisionWalls.length,
      collisionEraserCount: preset.collisionErasers.length
    };
    this.updateShadowPlane(preset.floorY);
  }

  private activePreset(preset: SplatArenaPreset): SplatArenaPreset {
    return this.calibrationSettings ? applyCalibrationToPreset(preset, this.calibrationSettings) : preset;
  }

  private async loadPreset(): Promise<SplatArenaPreset> {
    if (this.options.preset) {
      return this.options.preset;
    }
    if (this.options.presetUrl) {
      return loadSplatArenaPreset(this.options.presetUrl);
    }
    return (await loadConfiguredSplatArenaPreset()).preset;
  }

  private async createSplatLayer(preset: SplatArenaPreset): Promise<PlayCanvasSplatLayer> {
    const module = await import('./PlayCanvasSplatLayer');
    return module.createPlayCanvasSplatLayer({
      container: this.context.shell,
      camera: this.context.camera,
      preset
    });
  }

  private async loadCollisionProxy(preset: SplatArenaPreset): Promise<void> {
    if (this.disposed) return;

    this.debugInfo.occlusionStatus = 'loading';
    const result = await loadInvisibleCollisionMesh(preset).catch(() => createFallbackCollisionBounds(preset));
    if (this.disposed) {
      disposeObjectTree(result.group);
      return;
    }

    this.debugInfo.collisionStatus = result.status;
    this.debugInfo.occlusionStatus = result.status;
    this.collisionProxy = result.group;
    this.occlusionProxy = createDepthOnlyOcclusionProxy(result.group);
    setCollisionProxyDebugVisible(result.group, this.collisionDebugVisible);
    if (this.occlusionProxy) {
      this.setOcclusionProxyActive(this.debugInfo.splatLoadStatus === 'loaded');
      this.context.scene.add(this.occlusionProxy);
    } else {
      this.debugInfo.occlusionStatus = 'failed';
    }
    this.context.scene.add(result.group);
  }

  private async loadVoxelCollision(preset: SplatArenaPreset): Promise<void> {
    const token = ++this.voxelLoadToken;
    this.voxelCollision = null;
    this.debugInfo.voxelCollisionUrl = preset.voxelCollisionUrl ?? null;
    if (!preset.voxelCollisionUrl) {
      this.debugInfo.voxelCollisionStatus = 'none';
      return;
    }

    this.debugInfo.voxelCollisionStatus = 'loading';
    try {
      const collision = await loadVoxelCollisionFromUrl(preset.voxelCollisionUrl);
      if (this.disposed || token !== this.voxelLoadToken) return;
      this.voxelCollision = collision;
      this.debugInfo.voxelCollisionStatus = 'loaded';
      this.context.onStatus(`Voxel auto collision loaded: ${preset.voxelCollisionUrl}`);
    } catch (error) {
      if (this.disposed || token !== this.voxelLoadToken) return;
      this.voxelCollision = null;
      this.debugInfo.voxelCollisionStatus = 'failed';
      this.context.onStatus('Voxel auto collision failed; using fallback floor, bounds, and manual walls');
      console.warn(error);
    }
  }

  private fallbackToLightweight(message: string): void {
    if (this.disposed) return;
    this.debugInfo.splatLoadStatus = 'fallback';
    this.fallback.setVisible(true);
    this.setOcclusionProxyActive(false);
    this.context.renderer.setClearColor(ARENA_CLEAR_COLOR, 1);
    this.context.onStatus(message);
  }

  private setOcclusionProxyActive(active: boolean): void {
    if (this.occlusionProxy) {
      this.occlusionProxy.visible = active;
    }
  }

  private disposeCollisionProxies(): void {
    if (this.collisionProxy) {
      this.context.scene.remove(this.collisionProxy);
      disposeObjectTree(this.collisionProxy);
      this.collisionProxy = null;
    }
    if (this.occlusionProxy) {
      this.context.scene.remove(this.occlusionProxy);
      disposeObjectTree(this.occlusionProxy);
      this.occlusionProxy = null;
    }
  }
}

async function loadInvisibleCollisionMesh(preset: SplatArenaPreset): Promise<{ group: THREE.Group; status: CollisionStatus }> {
  if (!preset.collisionMeshUrl) {
    return createFallbackCollisionBounds(preset);
  }

  const response = await fetch(preset.collisionMeshUrl, { method: 'HEAD', cache: 'no-store' });
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || contentType.includes('text/html')) {
    return createFallbackCollisionBounds(preset);
  }

  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(preset.collisionMeshUrl);
  const group = gltf.scene;
  group.name = `${preset.arenaId}-collision-mesh`;
  return { group, status: 'loaded' };
}

function createFallbackCollisionBounds(preset: SplatArenaPreset): { group: THREE.Group; status: CollisionStatus } {
  const group = new THREE.Group();
  group.name = `${preset.arenaId}-fallback-collision-bounds`;
  group.visible = false;

  const material = new THREE.MeshBasicMaterial({ visible: false });
  const width = preset.bounds.maxX - preset.bounds.minX;
  const depth = preset.bounds.maxZ - preset.bounds.minZ;
  const centerX = (preset.bounds.minX + preset.bounds.maxX) / 2;
  const centerZ = (preset.bounds.minZ + preset.bounds.maxZ) / 2;
  const floorY = preset.floorY;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, floorY, centerZ);
  floor.userData.kind = 'collision-floor';
  group.add(floor);

  const wallMaterial = material.clone();
  const wallData = [
    { x: centerX, z: preset.bounds.minZ, w: width, d: 0.2 },
    { x: centerX, z: preset.bounds.maxZ, w: width, d: 0.2 },
    { x: preset.bounds.minX, z: centerZ, w: 0.2, d: depth },
    { x: preset.bounds.maxX, z: centerZ, w: 0.2, d: depth }
  ];

  for (const wall of wallData) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(wall.w, 1.8, wall.d), wallMaterial);
    mesh.position.set(wall.x, floorY + 0.9, wall.z);
    mesh.userData.kind = 'collision-wall';
    group.add(mesh);
  }

  group.userData.spawnPoints = preset.spawnPoints;
  group.userData.bounds = preset.bounds;
  group.userData.floorY = preset.floorY;
  group.userData.collisionWalls = preset.collisionWalls;
  group.userData.collisionErasers = preset.collisionErasers;

  for (const wall of preset.collisionWalls) {
    const height = Math.max(0.1, wall.height);
    const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(wall.width, height, wall.depth), wallMaterial.clone());
    wallMesh.position.set(wall.x, preset.floorY + height / 2, wall.z);
    wallMesh.rotation.y = wall.rotY;
    wallMesh.userData.kind = wall.climbable ? 'collision-ladder-custom' : 'collision-wall-custom';
    group.add(wallMesh);
  }
  return { group, status: 'fallback' };
}

function createDepthOnlyOcclusionProxy(source: THREE.Group): THREE.Group | null {
  const proxy = source.clone(true);
  proxy.name = `${source.name || 'collision'}-depth-occlusion`;
  proxy.visible = true;
  proxy.renderOrder = -100;

  let meshCount = 0;
  proxy.traverse((object) => {
    object.visible = true;
    object.renderOrder = -100;

    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    meshCount++;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    delete mesh.userData.originalCollisionMaterial;
    delete mesh.userData.debugCollisionMaterial;
    mesh.material = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide
    });
  });

  if (meshCount === 0) {
    disposeObjectTree(proxy);
    return null;
  }

  return proxy;
}

function setCollisionProxyDebugVisible(group: THREE.Group, visible: boolean): void {
  group.visible = visible;
  group.traverse((object) => {
    object.visible = visible;
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    if (!mesh.userData.originalCollisionMaterial) {
      mesh.userData.originalCollisionMaterial = mesh.material;
    }

    if (visible) {
      if (!mesh.userData.debugCollisionMaterial) {
        mesh.userData.debugCollisionMaterial = new THREE.MeshBasicMaterial({
          color: 0x38f8d7,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          wireframe: true
        });
      }
      mesh.material = mesh.userData.debugCollisionMaterial as THREE.Material;
    } else {
      mesh.material = mesh.userData.originalCollisionMaterial as THREE.Material | THREE.Material[];
      mesh.visible = false;
    }
  });
}

function cloneCalibrationSettings(settings: SplatCalibrationSettings): SplatCalibrationSettings {
  return {
    scale: settings.scale,
    rotation: { ...settings.rotation },
    offset: { ...settings.offset },
    floorY: settings.floorY,
    bounds: { ...settings.bounds },
    enabledModes: [...settings.enabledModes],
    spawnPoints: settings.spawnPoints.map((spawn) => ({ ...spawn })),
    spawnPointsByMode: {
      '1v1': settings.spawnPointsByMode['1v1']?.map((spawn) => ({ ...spawn })),
      '2v2': settings.spawnPointsByMode['2v2']?.map((spawn) => ({ ...spawn }))
    },
    collisionErasers: settings.collisionErasers.map((eraser) => ({ ...eraser })),
    collisionWalls: settings.collisionWalls.map((wall) => ({ ...wall }))
  };
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    disposeMaterial(material);
    const originalMaterial = mesh.userData?.originalCollisionMaterial as THREE.Material | THREE.Material[] | undefined;
    if (originalMaterial !== material) disposeMaterial(originalMaterial);
    const debugMaterial = mesh.userData?.debugCollisionMaterial as THREE.Material | undefined;
    if (debugMaterial !== material) disposeMaterial(debugMaterial);
  });
}

function disposeMaterial(material: THREE.Material | THREE.Material[] | undefined): void {
  if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
  else material?.dispose?.();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then((value) => {
      window.clearTimeout(timeout);
      resolve(value);
    }).catch((error) => {
      window.clearTimeout(timeout);
      reject(error);
    });
  });
}
