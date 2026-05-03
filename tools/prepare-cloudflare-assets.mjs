import { readdir, rm, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const distDir = join(process.cwd(), 'client', 'dist');
const maxWorkerAssetBytes = 25 * 1024 * 1024;
const optionalOversizedPatterns = [
  /^collision[/\\].+\.collision\.glb$/i
];

const oversized = [];

for (const file of await listFiles(distDir)) {
  const info = await stat(file);
  if (info.size <= maxWorkerAssetBytes) continue;
  const rel = relative(distDir, file);
  oversized.push({ file, rel, size: info.size });
}

for (const entry of oversized) {
  const optional = optionalOversizedPatterns.some((pattern) => pattern.test(entry.rel));
  if (!optional) {
    throw new Error(`Cloudflare Workers asset limit exceeded by ${entry.rel} (${formatMb(entry.size)} MiB). Move it to R2 or reduce it below 25 MiB.`);
  }
  await rm(entry.file);
  console.log(`[cloudflare-assets] Removed optional oversized asset ${entry.rel} (${formatMb(entry.size)} MiB).`);
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function formatMb(bytes) {
  return (bytes / 1024 / 1024).toFixed(2);
}
