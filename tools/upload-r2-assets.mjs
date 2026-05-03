import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { spawn } from 'node:child_process';

const bucket = process.env.R2_BUCKET || 'vibejam-assets';
const publicRoot = join(process.cwd(), 'client', 'public');
const folders = ['splats', 'collision', 'map-previews', 'models'];
const cacheControl = 'public, max-age=31536000, immutable';

const files = [];
for (const folder of folders) {
  files.push(...await listFiles(join(publicRoot, folder)));
}

console.log(`[r2-assets] Uploading ${files.length} files to ${bucket}...`);
for (const file of files) {
  const key = relative(publicRoot, file).split(sep).join('/');
  await uploadFile(`${bucket}/${key}`, file);
}
console.log(`[r2-assets] Uploaded ${files.length} files to ${bucket}.`);

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
    } else if (entry.isFile() && entry.name !== '.gitkeep') {
      files.push(fullPath);
    }
  }
  return files;
}

async function uploadFile(objectPath, file) {
  const args = [
    'wrangler',
    'r2',
    'object',
    'put',
    objectPath,
    '--file',
    file,
    '--content-type',
    contentType(file),
    '--cache-control',
    cacheControl,
    '--remote'
  ];
  await run('npx', args);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/c', [command, ...args].map(quoteCmdArg).join(' ')], { stdio: 'inherit' })
      : spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

function quoteCmdArg(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function contentType(file) {
  const lower = file.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.glb')) return 'model/gltf-binary';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.bin') || lower.endsWith('.sog')) return 'application/octet-stream';
  return 'application/octet-stream';
}
