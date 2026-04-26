import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { getClientAssetPath, resolveServerPort } from './staticClient';

describe('static client helpers', () => {
  it('uses Render PORT before local SERVER_PORT and the default', () => {
    expect(resolveServerPort({ PORT: '10000', SERVER_PORT: '3001' })).toBe(10000);
    expect(resolveServerPort({ SERVER_PORT: '3002' })).toBe(3002);
    expect(resolveServerPort({})).toBe(3001);
  });

  it('keeps static asset paths inside client/dist and falls back to index for routes', () => {
    const clientDist = resolve('repo/client/dist');

    expect(getClientAssetPath('/assets/app.js', clientDist)).toBe(join(clientDist, 'assets', 'app.js'));
    expect(getClientAssetPath('/duel/room', clientDist)).toBe(join(clientDist, 'index.html'));
    expect(getClientAssetPath('/../package.json', clientDist)).toBe(join(clientDist, 'index.html'));
  });
});
