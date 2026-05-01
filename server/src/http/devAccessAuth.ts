import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_ITERATIONS = 210000;
const KEY_LENGTH_BYTES = 32;
const DIGEST = 'SHA-256';

export interface DevAccessState {
  challenges: Map<string, number>;
  tokens: Map<string, number>;
}

type Env = NodeJS.ProcessEnv | Record<string, string | undefined>;

type AuthFailure = {
  ok: false;
  error: string;
  status: number;
};

export type DevAccessChallengeResult = AuthFailure | {
  ok: true;
  challenge: string;
  salt: string;
  iterations: number;
  keyLengthBytes: number;
  digest: typeof DIGEST;
};

export type DevAccessUnlockResult = AuthFailure | {
  ok: true;
  token: string;
  expiresAt: string;
};

export type DevAccessTokenResult = AuthFailure | {
  ok: true;
};

export const defaultDevAccessState = createDevAccessState();

export function createDevAccessState(): DevAccessState {
  return {
    challenges: new Map<string, number>(),
    tokens: new Map<string, number>()
  };
}

export function handleDevAccessAuthApi(
  request: IncomingMessage,
  response: ServerResponse,
  env: Env = process.env,
  state: DevAccessState = defaultDevAccessState
): boolean {
  const pathname = safePathname(request.url);
  if (!pathname.startsWith('/api/dev/access/')) return false;

  applyCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return true;
  }

  if (request.method === 'GET' && pathname === '/api/dev/access/challenge') {
    const result = createDevAccessChallenge(env, state, request.headers.host, request.socket.remoteAddress);
    sendJson(response, result.ok ? 200 : result.status, result);
    return true;
  }

  if (request.method === 'POST' && pathname === '/api/dev/access/unlock') {
    void readJsonBody(request)
      .then((body) => {
        const result = unlockDevAccess(env, state, body, request.headers.host, request.socket.remoteAddress);
        sendJson(response, result.ok ? 200 : result.status, result);
      })
      .catch((error) => sendJson(response, 400, { ok: false, error: errorMessage(error) }));
    return true;
  }

  sendJson(response, request.method === 'GET' || request.method === 'POST' ? 404 : 405, {
    ok: false,
    error: request.method === 'GET' || request.method === 'POST' ? 'Unknown dev access endpoint.' : 'Method not allowed.'
  });
  return true;
}

export function isDevAccessConfigured(env: Env): boolean {
  return Boolean(readSalt(env) && readPasswordKey(env));
}

export function createDevAccessChallenge(
  env: Env,
  state: DevAccessState,
  host: string | undefined,
  remoteAddress: string | undefined
): DevAccessChallengeResult {
  const base = validateBaseAccess(env, host, remoteAddress);
  if (!base.ok) return base;

  cleanupExpired(state);
  const challenge = randomBytes(32).toString('base64url');
  state.challenges.set(challenge, Date.now() + CHALLENGE_TTL_MS);
  return {
    ok: true,
    challenge,
    salt: base.salt.toString('hex'),
    iterations: readIterations(env),
    keyLengthBytes: KEY_LENGTH_BYTES,
    digest: DIGEST
  };
}

export function unlockDevAccess(
  env: Env,
  state: DevAccessState,
  body: unknown,
  host: string | undefined,
  remoteAddress: string | undefined
): DevAccessUnlockResult {
  const base = validateBaseAccess(env, host, remoteAddress);
  if (!base.ok) return base;

  const data = asRecord(body);
  const challenge = typeof data.challenge === 'string' ? data.challenge : '';
  const proof = typeof data.proof === 'string' ? data.proof : '';
  cleanupExpired(state);

  const expiresAt = state.challenges.get(challenge);
  if (!expiresAt || expiresAt <= Date.now()) {
    state.challenges.delete(challenge);
    return failure(401, 'Challenge expired or already used.');
  }

  state.challenges.delete(challenge);
  const expected = createHmac('sha256', base.key).update(challenge).digest();
  const actual = readHex(proof, expected.length);
  if (!actual || !timingSafeEqual(actual, expected)) {
    return failure(401, 'Invalid password.');
  }

  const token = randomBytes(32).toString('base64url');
  const tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
  state.tokens.set(token, tokenExpiresAt);
  return {
    ok: true,
    token,
    expiresAt: new Date(tokenExpiresAt).toISOString()
  };
}

export function requireDevAccessToken(
  env: Env,
  state: DevAccessState,
  authorization: string | undefined,
  host: string | undefined,
  remoteAddress: string | undefined
): DevAccessTokenResult {
  const base = validateBaseAccess(env, host, remoteAddress);
  if (!base.ok) return base;

  cleanupExpired(state);
  const token = parseBearerToken(authorization);
  if (!token) return failure(401, 'Dev access token required.');

  const expiresAt = state.tokens.get(token);
  if (!expiresAt || expiresAt <= Date.now()) {
    state.tokens.delete(token);
    return failure(401, 'Invalid or expired dev access token.');
  }

  return { ok: true };
}

function validateBaseAccess(
  env: Env,
  host: string | undefined,
  remoteAddress: string | undefined
): AuthFailure | { ok: true; salt: Buffer; key: Buffer } {
  if (!isLocalDevAccessRequestAllowed(env, host, remoteAddress)) {
    return failure(403, 'Dev access is local/development only.');
  }

  const salt = readSalt(env);
  const key = readPasswordKey(env);
  if (!salt || !key) {
    return failure(503, 'Dev access password verifier is not configured.');
  }

  return { ok: true, salt, key };
}

export function isLocalDevAccessRequestAllowed(
  env: Env,
  host: string | undefined,
  remoteAddress: string | undefined
): boolean {
  if (env.NODE_ENV === 'production' || env.RENDER === 'true') {
    return false;
  }
  return isLocalHostname(host) && isLocalRemoteAddress(remoteAddress);
}

function readSalt(env: Env): Buffer | null {
  return readHex(env.DEV_ACCESS_PASSWORD_SALT);
}

function readPasswordKey(env: Env): Buffer | null {
  return readHex(env.DEV_ACCESS_PASSWORD_KEY, KEY_LENGTH_BYTES);
}

function readIterations(env: Env): number {
  const parsed = Number.parseInt(env.DEV_ACCESS_PASSWORD_ITERATIONS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ITERATIONS;
}

function readHex(value: string | undefined, expectedBytes?: number): Buffer | null {
  if (!value || !/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null;
  const buffer = Buffer.from(value, 'hex');
  if (expectedBytes !== undefined && buffer.length !== expectedBytes) return null;
  return buffer;
}

function parseBearerToken(value: string | undefined): string | null {
  const match = /^Bearer\s+([A-Za-z0-9_-]+)$/i.exec(value ?? '');
  return match?.[1] ?? null;
}

function cleanupExpired(state: DevAccessState): void {
  const now = Date.now();
  for (const [challenge, expiresAt] of state.challenges) {
    if (expiresAt <= now) state.challenges.delete(challenge);
  }
  for (const [token, expiresAt] of state.tokens) {
    if (expiresAt <= now) state.tokens.delete(token);
  }
}

function isLocalHostname(host: string | undefined): boolean {
  const hostname = (host ?? '').split(':')[0]?.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function isLocalRemoteAddress(remoteAddress: string | undefined): boolean {
  return !remoteAddress
    || remoteAddress === '127.0.0.1'
    || remoteAddress === '::1'
    || remoteAddress === '::ffff:127.0.0.1';
}

function safePathname(url: string | undefined): string {
  try {
    return new URL(url ?? '/', 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 4096) {
        reject(new Error('Request body too large'));
      }
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, authorization'
  });
  response.end(JSON.stringify(data));
}

function applyCorsHeaders(response: ServerResponse): void {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type, authorization');
}

function failure(status: number, error: string): AuthFailure {
  return { ok: false, status, error };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
