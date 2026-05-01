import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isVfxDevPostAuthorized, resolveWritableVfxDir } from './vfxDevApi';

describe('vfx dev api auth', () => {
  it('requires an unlocked dev access token for VFX save requests', () => {
    expect(isVfxDevPostAuthorized({
      NODE_ENV: 'development',
      DEV_ACCESS_PASSWORD_SALT: '00112233445566778899aabbccddeeff',
      DEV_ACCESS_PASSWORD_KEY: '00'.repeat(32)
    }, undefined, '127.0.0.1:3001', '::1')).toMatchObject({
      ok: false,
      error: 'Dev access token required.'
    });
  });

  it('allows remote production auth to reach token validation when explicitly enabled', () => {
    expect(isVfxDevPostAuthorized({
      NODE_ENV: 'production',
      DEV_ACCESS_REMOTE_ENABLED: '1',
      DEV_ACCESS_PASSWORD_SALT: '00112233445566778899aabbccddeeff',
      DEV_ACCESS_PASSWORD_KEY: '00'.repeat(32)
    }, undefined, 'gamejam-proyect.fly.dev', '203.0.113.1')).toMatchObject({
      ok: false,
      error: 'Dev access token required.'
    });
  });

  it('uses client/dist for runtime VFX writes when public assets are absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'magic-casters-vfx-runtime-'));
    await mkdir(join(root, 'client', 'dist'), { recursive: true });

    expect(resolveWritableVfxDir(root)).toBe(join(root, 'client', 'dist', 'vfx'));
  });
});
