import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { applyDevAccessCorsHeaders, defaultDevAccessState, requireDevAccessToken, type DevAccessState } from './devAccessAuth.js';

function getBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => body += chunk);
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function sendJson(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(data));
}

export async function handleVfxDevApi(
  request: IncomingMessage,
  response: ServerResponse,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  devAccessState: DevAccessState = defaultDevAccessState
): Promise<boolean> {
  if (request.url !== '/api/vfx/save') {
    return false;
  }

  applyDevAccessCorsHeaders(response, env, request.headers.origin, request.headers.host, request.socket.remoteAddress);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return true;
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed' });
    return true;
  }

  const auth = isVfxDevPostAuthorized(env, request.headers.authorization, request.headers.host, request.socket.remoteAddress, devAccessState);
  if (!auth.ok) {
    sendJson(response, auth.status, { ok: false, error: auth.error });
    return true;
  }

  try {
    const body = await getBody(request);
    const data = JSON.parse(body);

    if (!data.id || typeof data.id !== 'string') {
      sendJson(response, 400, { error: 'Missing or invalid "id" field' });
      return true;
    }

    if (!data.layers || !Array.isArray(data.layers)) {
      sendJson(response, 400, { error: 'Missing or invalid "layers" field' });
      return true;
    }

    const vfxDir = resolveWritableVfxDir();
    if (!existsSync(vfxDir)) {
      mkdirSync(vfxDir, { recursive: true });
    }

    // Sanitize id to prevent path traversal
    const id = data.id.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id) {
      sendJson(response, 400, { error: 'Invalid id' });
      return true;
    }

    const filePath = join(vfxDir, `${id}.json`);
    writeFileSync(filePath, JSON.stringify(data, null, 2));

    // Update index.json
    const indexPath = join(vfxDir, 'index.json');
    let index: string[] = [];
    if (existsSync(indexPath)) {
      try {
        index = JSON.parse(readFileSync(indexPath, 'utf-8')) as string[];
      } catch {
        index = [];
      }
    }
    if (!index.includes(id)) {
      index.push(id);
      writeFileSync(indexPath, JSON.stringify(index, null, 2));
    }

    sendJson(response, 200, { ok: true, id, path: filePath });
  } catch (err) {
    sendJson(response, 500, { error: (err as Error).message });
  }

  return true;
}

export function resolveWritableVfxDir(root = process.cwd()): string {
  const publicDir = resolve(root, 'client', 'public');
  return resolve(existsSync(publicDir) ? publicDir : resolve(root, 'client', 'dist'), 'vfx');
}

export function isVfxDevPostAuthorized(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  authorization: string | undefined,
  host: string | undefined,
  remoteAddress: string | undefined,
  devAccessState: DevAccessState = defaultDevAccessState
): { ok: true } | { ok: false; status: number; error: string } {
  return requireDevAccessToken(env, devAccessState, authorization, host, remoteAddress);
}
