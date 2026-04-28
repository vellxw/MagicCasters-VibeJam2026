import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ply': 'application/octet-stream',
  '.sog': 'application/octet-stream',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream'
};

export function resolveServerPort(env: NodeJS.ProcessEnv | Record<string, string | undefined>): number {
  const raw = env.PORT ?? env.SERVER_PORT ?? '3001';
  const port = Number(raw);
  return Number.isFinite(port) && port > 0 ? port : 3001;
}

export function getClientDistPath(root = process.cwd()): string {
  return resolve(root, 'client', 'dist');
}

export function getClientAssetPath(url: string | undefined, clientDist: string): string {
  if (hasTraversalSegment(url)) {
    return join(clientDist, 'index.html');
  }

  const pathname = safePathname(url);

  if (!hasFileExtension(pathname)) {
    return join(clientDist, 'index.html');
  }

  const candidate = resolve(clientDist, `.${pathname}`);
  const normalizedRoot = normalize(clientDist + sep);
  if (!candidate.startsWith(normalizedRoot)) {
    return join(clientDist, 'index.html');
  }

  return candidate;
}

export function serveClient(request: IncomingMessage, response: ServerResponse, clientDist = getClientDistPath()): void {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Method not allowed');
    return;
  }

  if (!existsSync(clientDist)) {
    response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Client build missing. Run npm run build first.');
    return;
  }

  let assetPath = getClientAssetPath(request.url, clientDist);
  if (!existsSync(assetPath) || !statSync(assetPath).isFile()) {
    assetPath = join(clientDist, 'index.html');
  }

  const extension = extname(assetPath).toLowerCase();
  response.writeHead(200, {
    'content-type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
    'cache-control': cacheControlForExtension(extension)
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  createReadStream(assetPath).pipe(response);
}

function safePathname(url: string | undefined): string {
  try {
    return decodeURIComponent(new URL(url ?? '/', 'http://localhost').pathname);
  } catch {
    return '/';
  }
}

function hasFileExtension(pathname: string): boolean {
  return Boolean(extname(pathname));
}

function hasTraversalSegment(url: string | undefined): boolean {
  try {
    return decodeURIComponent(url ?? '').split(/[\\/]/).includes('..');
  } catch {
    return true;
  }
}

function cacheControlForExtension(extension: string): string {
  if (extension === '.html' || extension === '.sog') return 'no-store';
  return 'public, max-age=31536000, immutable';
}
