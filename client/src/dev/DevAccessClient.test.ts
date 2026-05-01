import { createHmac, pbkdf2Sync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  DevAccessClient,
  clearDevAccessToken,
  deriveDevAccessProof,
  getDevAccessAuthorizationHeaders,
  getDevAccessToken
} from './DevAccessClient';

const saltHex = '00112233445566778899aabbccddeeff';

describe('DevAccessClient', () => {
  it('derives the one-use challenge proof without exposing the password', async () => {
    const key = pbkdf2Sync('private-password', Buffer.from(saltHex, 'hex'), 210000, 32, 'sha256');
    const expected = createHmac('sha256', key).update('challenge-value').digest('hex');

    await expect(deriveDevAccessProof('private-password', {
      ok: true,
      challenge: 'challenge-value',
      salt: saltHex,
      iterations: 210000,
      keyLengthBytes: 32,
      digest: 'SHA-256'
    })).resolves.toBe(expected);
  });

  it('keeps the unlocked token in memory and sends only a proof to the server', async () => {
    clearDevAccessToken();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        challenge: 'challenge-value',
        salt: saltHex,
        iterations: 210000,
        keyLengthBytes: 32,
        digest: 'SHA-256'
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        token: 'token-123',
        expiresAt: '2026-05-01T20:00:00.000Z'
      }));

    const client = new DevAccessClient({
      fetchImpl,
      requestPassword: async () => 'private-password',
      resolveBaseUrl: () => 'http://localhost:3001'
    });

    await expect(client.ensureUnlocked()).resolves.toEqual({ ok: true });

    expect(getDevAccessToken()).toBe('token-123');
    expect(getDevAccessAuthorizationHeaders({ 'content-type': 'application/json' })).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer token-123'
    });
    const unlockBody = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body));
    expect(unlockBody.challenge).toBe('challenge-value');
    expect(unlockBody.proof).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(unlockBody)).not.toContain('private-password');
  });
});

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload
  } as Response;
}
