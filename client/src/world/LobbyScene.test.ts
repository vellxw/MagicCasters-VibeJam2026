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
      fillText: vi.fn()
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
});
