import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { createAuthDatabase } from '../db';
import { createAuthApiHandler } from './authApi';

async function withAuthServer(
  env: Record<string, string | undefined>,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const database = createAuthDatabase(':memory:');
  const handleAuthApi = createAuthApiHandler({ env, database });
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (await handleAuthApi(request, response)) return;
    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Server did not bind to a port');

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    database.close();
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe('auth API', () => {
  const configuredEnv = {
    NODE_ENV: 'test',
    AUTH_JWT_SECRET: 'test-secret-at-least-long-enough'
  };

  it('registers a user, returns a token, and starts MMR at 1000', async () => {
    await withAuthServer(configuredEnv, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ username: 'kairos', password: 'secret-123' })
      });
      const body = await readJson(response);

      expect(response.status).toBe(201);
      expect(body.username).toBe('kairos');
      expect(body.mmr).toBe(1000);
      expect(body.token).toEqual(expect.any(String));
    });
  });

  it('rejects invalid register payloads', async () => {
    await withAuthServer(configuredEnv, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ username: 'ka', password: '123' })
      });
      const body = await readJson(response);

      expect(response.status).toBe(400);
      expect(body.error).toEqual(expect.any(String));
    });
  });

  it('logs in with valid credentials and rejects wrong credentials', async () => {
    await withAuthServer(configuredEnv, async (baseUrl) => {
      await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ username: 'lyra', password: 'secret-123' })
      });

      const login = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ username: 'lyra', password: 'secret-123' })
      });
      const loginBody = await readJson(login);

      expect(login.status).toBe(200);
      expect(loginBody.username).toBe('lyra');
      expect(loginBody.mmr).toBe(1000);
      expect(loginBody.token).toEqual(expect.any(String));

      const rejected = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ username: 'lyra', password: 'wrong-pass' })
      });

      expect(rejected.status).toBe(401);
    });
  });

  it('validates bearer tokens through /api/auth/me', async () => {
    await withAuthServer(configuredEnv, async (baseUrl) => {
      const register = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ username: 'nox', password: 'secret-123' })
      });
      const registerBody = await readJson(register);

      const me = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${String(registerBody.token)}`, Origin: baseUrl }
      });
      const meBody = await readJson(me);

      expect(me.status).toBe(200);
      expect(meBody.username).toBe('nox');
      expect(meBody.mmr).toBe(1000);

      const rejected = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: 'Bearer invalid', Origin: baseUrl }
      });

      expect(rejected.status).toBe(401);
    });
  });

  it('does not enable production auth without AUTH_JWT_SECRET', async () => {
    await withAuthServer({ NODE_ENV: 'production' }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: baseUrl },
        body: JSON.stringify({ username: 'prod', password: 'secret-123' })
      });
      const body = await readJson(response);

      expect(response.status).toBe(503);
      expect(body.error).toEqual(expect.any(String));
    });
  });
});
