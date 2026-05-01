import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { LobbyScene } from './LobbyScene';
import type { VfxRuntime } from '../vfx/VfxRuntime';

describe('LobbyScene', () => {
  const originalDocument = globalThis.document;

  beforeEach(() => {
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      createLinearGradient: vi.fn(() => ({
        addColorStop: vi.fn()
      }))
    };
    globalThis.document = {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => context)
      }))
    } as unknown as Document;
  });

  afterEach(() => {
    globalThis.document = originalDocument;
  });

  it('updates the lobby VFX runtime with the scene delta', () => {
    const scene = new THREE.Scene();
    const lobby = new LobbyScene(scene, {} as HTMLElement);
    const runtime = {
      update: vi.fn(),
      stop: vi.fn()
    } as unknown as VfxRuntime;

    (lobby as unknown as { vfxRuntime: VfxRuntime }).vfxRuntime = runtime;

    lobby.update({
      forward: false,
      backward: false,
      left: false,
      right: false
    }, 0.25);

    expect(runtime.update).toHaveBeenCalledWith(0.25);
  });

  it('blocks local lobby movement with calibrated collision walls', () => {
    const scene = new THREE.Scene();
    const lobby = new LobbyScene(scene, {} as HTMLElement, {
      presetId: 'lobby-high',
      arenaId: 'splat-test',
      displayName: 'Lobby',
      type: 'splat',
      splatUrl: '/splats/lobby-high.sog',
      enabledModes: [],
      collisionMeshUrl: null,
      voxelCollisionUrl: null,
      spawnPoints: [{ x: 0, y: 0, z: 0, rotY: 0 }],
      spawnPointsByMode: {},
      bounds: { minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
      scale: 1,
      rotation: { x: 0, y: 0, z: 0 },
      offset: { x: 0, y: 0, z: 0 },
      floorY: 0,
      collisionErasers: [],
      collisionWalls: [{
        id: 'front-wall',
        x: 0,
        z: -1.4,
        width: 3,
        depth: 0.4,
        height: 3,
        rotY: 0
      }]
    });

    lobby.update({
      forward: true,
      backward: false,
      left: false,
      right: false,
      rotY: 0
    }, 0.25);

    expect(lobby.getPlayerPosition().z).toBeGreaterThan(-0.95);
  });

  it('allows an airborne lobby dash in the facing direction', () => {
    const scene = new THREE.Scene();
    const lobby = new LobbyScene(scene, {} as HTMLElement, {
      presetId: 'lobby-high',
      arenaId: 'splat-test',
      displayName: 'Lobby',
      type: 'splat',
      splatUrl: '/splats/lobby-high.sog',
      enabledModes: [],
      collisionMeshUrl: null,
      voxelCollisionUrl: null,
      spawnPoints: [{ x: 0, y: 0, z: 0, rotY: 0 }],
      spawnPointsByMode: {},
      bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      scale: 1,
      rotation: { x: 0, y: 0, z: 0 },
      offset: { x: 0, y: 0, z: 0 },
      floorY: 0,
      collisionErasers: [],
      collisionWalls: []
    });

    lobby.update({
      forward: true,
      backward: false,
      left: false,
      right: false,
      jump: true,
      rotY: 0
    }, 0.05);
    const beforeDash = lobby.getPlayerPosition();

    lobby.update({
      forward: true,
      backward: false,
      left: false,
      right: false,
      dash: true,
      rotY: 0
    }, 0.05);

    expect(lobby.getPlayerPosition().z).toBeLessThan(beforeDash.z - 1.5);
  });

  it('air dashes forward in lobby even when no movement key is held', () => {
    const scene = new THREE.Scene();
    const lobby = new LobbyScene(scene, {} as HTMLElement, {
      presetId: 'lobby-high',
      arenaId: 'splat-test',
      displayName: 'Lobby',
      type: 'splat',
      splatUrl: '/splats/lobby-high.sog',
      enabledModes: [],
      collisionMeshUrl: null,
      voxelCollisionUrl: null,
      spawnPoints: [{ x: 0, y: 0, z: 0, rotY: 0 }],
      spawnPointsByMode: {},
      bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      scale: 1,
      rotation: { x: 0, y: 0, z: 0 },
      offset: { x: 0, y: 0, z: 0 },
      floorY: 0,
      collisionErasers: [],
      collisionWalls: []
    });

    lobby.update({
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: true,
      rotY: 0
    }, 0.05);
    const beforeDash = lobby.getPlayerPosition();

    lobby.update({
      forward: false,
      backward: false,
      left: false,
      right: false,
      dash: true,
      rotY: 0
    }, 0.05);

    expect(lobby.getPlayerPosition().z).toBeLessThan(beforeDash.z - 1.5);
  });
});
