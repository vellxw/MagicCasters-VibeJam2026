import { createHmac, pbkdf2Sync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createDevAccessChallenge,
  createDevAccessState,
  isDevAccessConfigured,
  requireDevAccessToken,
  unlockDevAccess
} from './devAccessAuth';

const saltHex = '00112233445566778899aabbccddeeff';
const password = 'private-password';
const keyHex = pbkdf2Sync(password, Buffer.from(saltHex, 'hex'), 210000, 32, 'sha256').toString('hex');
const configuredEnv = {
  NODE_ENV: 'development',
  DEV_ACCESS_PASSWORD_SALT: saltHex,
  DEV_ACCESS_PASSWORD_KEY: keyHex
};

function proofFor(challenge: string): string {
  return createHmac('sha256', Buffer.from(keyHex, 'hex')).update(challenge).digest('hex');
}

describe('dev access auth', () => {
  it('reports whether the password verifier is configured', () => {
    expect(isDevAccessConfigured(configuredEnv)).toBe(true);
    expect(isDevAccessConfigured({ NODE_ENV: 'development' })).toBe(false);
    expect(isDevAccessConfigured({ ...configuredEnv, DEV_ACCESS_PASSWORD_KEY: 'not-hex' })).toBe(false);
  });

  it('creates challenges only for local non-production configured requests', () => {
    const state = createDevAccessState();
    const challenge = createDevAccessChallenge(configuredEnv, state, '127.0.0.1:3001', '::1');

    expect(challenge.ok).toBe(true);
    expect(challenge.salt).toBe(saltHex);
    expect(challenge.iterations).toBe(210000);
    expect(challenge.challenge).toMatch(/^[A-Za-z0-9_-]+$/);

    expect(createDevAccessChallenge({ ...configuredEnv, NODE_ENV: 'production' }, state, '127.0.0.1:3001', '::1')).toMatchObject({
      ok: false,
      error: 'Dev access is local/development only.'
    });
    expect(createDevAccessChallenge({ NODE_ENV: 'development' }, state, '127.0.0.1:3001', '::1')).toMatchObject({
      ok: false,
      error: 'Dev access password verifier is not configured.'
    });
  });

  it('unlocks a temporary bearer token with a one-use proof', () => {
    const state = createDevAccessState();
    const challenge = createDevAccessChallenge(configuredEnv, state, '127.0.0.1:3001', '::1');
    expect(challenge.ok).toBe(true);

    const unlocked = unlockDevAccess(configuredEnv, state, { challenge: challenge.challenge, proof: proofFor(challenge.challenge) }, '127.0.0.1:3001', '::1');

    expect(unlocked.ok).toBe(true);
    expect(unlocked.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(requireDevAccessToken(configuredEnv, state, `Bearer ${unlocked.token}`, '127.0.0.1:3001', '::1')).toEqual({ ok: true });
    expect(unlockDevAccess(configuredEnv, state, { challenge: challenge.challenge, proof: proofFor(challenge.challenge) }, '127.0.0.1:3001', '::1')).toMatchObject({
      ok: false,
      error: 'Challenge expired or already used.'
    });
  });

  it('rejects invalid proofs and missing bearer tokens', () => {
    const state = createDevAccessState();
    const challenge = createDevAccessChallenge(configuredEnv, state, 'localhost:3001', '127.0.0.1');
    expect(challenge.ok).toBe(true);

    expect(unlockDevAccess(configuredEnv, state, { challenge: challenge.challenge, proof: '00' }, 'localhost:3001', '127.0.0.1')).toMatchObject({
      ok: false,
      error: 'Invalid password.'
    });
    expect(requireDevAccessToken(configuredEnv, state, undefined, 'localhost:3001', '127.0.0.1')).toMatchObject({
      ok: false,
      error: 'Dev access token required.'
    });
    expect(requireDevAccessToken(configuredEnv, state, 'Bearer wrong', 'localhost:3001', '127.0.0.1')).toMatchObject({
      ok: false,
      error: 'Invalid or expired dev access token.'
    });
  });
});
