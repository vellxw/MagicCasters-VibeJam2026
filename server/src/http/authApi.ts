import bcrypt from 'bcryptjs';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { createAuthDatabase, resolveDefaultAuthDbPath, type AuthDatabase } from '../db.js';

type EnvLike = Record<string, string | undefined>;
type AuthHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

interface AuthApiOptions {
  database?: AuthDatabase;
  dbPath?: string;
  env?: EnvLike;
}

interface AuthUser {
  id: number;
  mmr: number;
  password_hash: string;
  username: string;
}

interface TokenPayload extends JwtPayload {
  sub: string;
  username: string;
}

const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(24, 'Username must be at most 24 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only use letters, numbers, underscores, and dashes'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128, 'Password is too long'),
});

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(body));
}

function sendNoContent(res: ServerResponse): void {
  res.writeHead(204);
  res.end();
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function normalizeHost(value: string): string {
  return value.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
}

function isLocalhost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isAllowedOrigin(origin: string | undefined, headers: IncomingHttpHeaders, env: EnvLike): boolean {
  if (!origin) {
    return true;
  }

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  const requestHost = headers.host?.toLowerCase();
  if (requestHost && originUrl.host.toLowerCase() === requestHost) {
    return true;
  }

  const configuredOrigins = env.AUTH_ALLOWED_ORIGINS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (configuredOrigins?.includes(origin)) {
    return true;
  }

  return env.NODE_ENV !== 'production' && isLocalhost(originUrl.hostname);
}

function applyCors(req: IncomingMessage, res: ServerResponse, env: EnvLike): boolean {
  const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
  if (!isAllowedOrigin(origin, req.headers, env)) {
    sendJson(res, 403, { error: 'Origin not allowed' });
    return false;
  }

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  return true;
}

function getJwtSecret(env: EnvLike): string | null {
  const configuredSecret = env.AUTH_JWT_SECRET?.trim();
  if (configuredSecret) {
    return configuredSecret;
  }

  return env.NODE_ENV === 'production' ? null : 'local-development-auth-secret';
}

function signToken(user: Pick<AuthUser, 'id' | 'username'>, secret: string): string {
  return jwt.sign({ username: user.username }, secret, { expiresIn: '7d', subject: String(user.id) });
}

function verifyToken(token: string, secret: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === 'object' && decoded !== null && typeof decoded.sub === 'string') {
      return decoded as TokenPayload;
    }
  } catch {
    return null;
  }
  return null;
}

function findUserByUsername(db: AuthDatabase, username: string): AuthUser | undefined {
  return db.prepare('SELECT id, username, password_hash, mmr FROM users WHERE username = ?').get(username) as
    | AuthUser
    | undefined;
}

function findUserById(db: AuthDatabase, id: number): AuthUser | undefined {
  return db.prepare('SELECT id, username, password_hash, mmr FROM users WHERE id = ?').get(id) as AuthUser | undefined;
}

function getBearerToken(headers: IncomingHttpHeaders): string | null {
  const value = Array.isArray(headers.authorization) ? headers.authorization[0] : headers.authorization;
  if (!value?.startsWith('Bearer ')) {
    return null;
  }
  return value.slice('Bearer '.length).trim() || null;
}

export function createAuthApiHandler(options: AuthApiOptions = {}): AuthHandler {
  const env = options.env ?? process.env;
  let db = options.database;
  let dbInitError: Error | null = null;

  function getDatabase(): AuthDatabase | null {
    if (db) {
      return db;
    }
    if (dbInitError) {
      return null;
    }

    try {
      db = createAuthDatabase(options.dbPath ?? resolveDefaultAuthDbPath(env));
      return db;
    } catch (error) {
      dbInitError = error instanceof Error ? error : new Error(String(error));
      console.warn('[auth] SQLite initialization failed:', dbInitError.message);
      return null;
    }
  }

  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/auth')) {
      return false;
    }

    if (!applyCors(req, res, env)) {
      return true;
    }

    if (req.method === 'OPTIONS') {
      sendNoContent(res);
      return true;
    }

    const secret = getJwtSecret(env);
    if (!secret) {
      sendJson(res, 503, { error: 'Auth service unavailable' });
      return true;
    }

    const database = getDatabase();
    if (!database) {
      sendJson(res, 503, { error: 'Auth service unavailable' });
      return true;
    }

    try {
      if (req.method === 'POST' && url.pathname === '/api/auth/register') {
        const parsed = credentialsSchema.safeParse(await readBody(req));
        if (!parsed.success) {
          sendJson(res, 400, { error: 'Invalid credentials', issues: parsed.error.flatten().fieldErrors });
          return true;
        }

        const existingUser = findUserByUsername(database, parsed.data.username);
        if (existingUser) {
          sendJson(res, 409, { error: 'Username already exists' });
          return true;
        }

        const passwordHash = bcrypt.hashSync(parsed.data.password, 10);
        const result = database
          .prepare('INSERT INTO users (username, password_hash, mmr) VALUES (?, ?, 1000)')
          .run(parsed.data.username, passwordHash);
        const user = {
          id: Number(result.lastInsertRowid),
          mmr: 1000,
          password_hash: passwordHash,
          username: parsed.data.username,
        };

        sendJson(res, 201, { mmr: user.mmr, token: signToken(user, secret), username: user.username });
        return true;
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/login') {
        const parsed = credentialsSchema.safeParse(await readBody(req));
        if (!parsed.success) {
          sendJson(res, 400, { error: 'Invalid credentials', issues: parsed.error.flatten().fieldErrors });
          return true;
        }

        const user = findUserByUsername(database, parsed.data.username);
        if (!user || !bcrypt.compareSync(parsed.data.password, user.password_hash)) {
          sendJson(res, 401, { error: 'Invalid username or password' });
          return true;
        }

        sendJson(res, 200, { mmr: user.mmr, token: signToken(user, secret), username: user.username });
        return true;
      }

      if (req.method === 'GET' && url.pathname === '/api/auth/me') {
        const token = getBearerToken(req.headers);
        const payload = token ? verifyToken(token, secret) : null;
        const userId = payload ? Number(payload.sub) : Number.NaN;
        const user = Number.isFinite(userId) ? findUserById(database, userId) : undefined;
        if (!user) {
          sendJson(res, 401, { error: 'Invalid or missing token' });
          return true;
        }

        sendJson(res, 200, { mmr: user.mmr, username: user.username });
        return true;
      }

      sendJson(res, 404, { error: 'Auth endpoint not found' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected auth error';
      sendJson(res, message === 'Invalid JSON body' ? 400 : 500, { error: message });
      return true;
    }
  };
}

const defaultAuthApiHandler = createAuthApiHandler();

export async function handleAuthApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  return defaultAuthApiHandler(req, res);
}
