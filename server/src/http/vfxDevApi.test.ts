import { describe, expect, it } from 'vitest';
import { isVfxDevPostAuthorized } from './vfxDevApi';

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
});
