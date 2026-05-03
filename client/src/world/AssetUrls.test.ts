import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadAssetUrls() {
  vi.resetModules();
  return import('./AssetUrls');
}

describe('AssetUrls', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps local asset paths when no asset base URL is configured', async () => {
    const { assetUrl } = await loadAssetUrls();

    expect(assetUrl('/splats/lobby-mid.sog')).toBe('/splats/lobby-mid.sog');
    expect(assetUrl('/arena-presets/lobby-mid.json')).toBe('/arena-presets/lobby-mid.json');
  });

  it('moves heavy public assets to the configured CDN/R2 origin', async () => {
    vi.stubEnv('VITE_ASSET_BASE_URL', 'https://assets.example.com/');
    const { assetUrl } = await loadAssetUrls();

    expect(assetUrl('/splats/lobby-mid.sog')).toBe('https://assets.example.com/splats/lobby-mid.sog');
    expect(assetUrl('/collision/lobby-high.collision.glb')).toBe('https://assets.example.com/collision/lobby-high.collision.glb');
    expect(assetUrl('/map-previews/lobby.png')).toBe('https://assets.example.com/map-previews/lobby.png');
    expect(assetUrl('/models/mago-negro.glb')).toBe('https://assets.example.com/models/mago-negro.glb');
  });

  it('defaults public traffic to mid quality unless explicitly overridden', async () => {
    const first = await loadAssetUrls();
    expect(first.getDefaultSplatQuality()).toBe('mid');

    vi.stubEnv('VITE_DEFAULT_SPLAT_QUALITY', 'low');
    const second = await loadAssetUrls();
    expect(second.getDefaultSplatQuality()).toBe('low');
  });
});
