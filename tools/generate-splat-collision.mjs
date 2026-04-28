#!/usr/bin/env node
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = parseArgs(process.argv.slice(2));

if (options.help || !options.input) {
  printUsage();
  process.exit(options.help ? 0 : 1);
}

const inputPath = resolveFromRoot(String(options.input));
if (!existsSync(inputPath)) {
  fail(`Input file not found: ${inputPath}`);
}
const inputSizeBytes = statSync(inputPath).size;

const arenaId = sanitizeArenaId(String(options.arena ?? path.basename(inputPath, path.extname(inputPath))));
const outputDir = resolveFromRoot(String(options.outputDir ?? 'client/public/collision'));
const largeMode = Boolean(options.large);
const resolution = numberOption(options.resolution, largeMode ? 64 : 256);
const worldSpan = numberOption(options.worldSpan, 12.8);
const voxelSize = numberOption(options.voxelSize, largeMode ? 0.3 : worldSpan / resolution);
const opacity = numberOption(options.opacity, largeMode ? 0.35 : 0.1);
const seed = String(options.seed ?? '0,0,0');
const carve = String(options.carve ?? (largeMode ? 'none' : '1.7,0.3'));
const externalFill = optionalNumberOption(options.externalFill, largeMode ? null : 1.6);
const floorFill = optionalNumberOption(options.floorFill, largeMode ? null : 1.6);
const decimate = stringOption(options.decimate, largeMode ? '1%' : null);
const gpu = stringOption(options.gpu, null);
const filterBox = stringOption(options.filterBox, null);
const filterSphere = stringOption(options.filterSphere, null);
const filterCluster = stringOption(options.filterCluster, null);
const dryRun = Boolean(options.dryRun);
const allowHuge = Boolean(options.allowHuge);

if (
  inputSizeBytes >= 120 * 1024 * 1024 &&
  !allowHuge &&
  !filterBox &&
  !filterSphere
) {
  fail([
    `Input SOG is ${formatBytes(inputSizeBytes)}, which is too large for direct whole-map voxelization on this local pipeline.`,
    'Use SuperSplat to export a smaller/cropped collision source, or rerun with --filter-box / --filter-sphere for the zone you want to voxelize.',
    'If you still want to force the slow path, add --allow-huge.'
  ].join('\n'));
}

mkdirSync(outputDir, { recursive: true });

const voxelJson = path.join(outputDir, `${arenaId}.voxel.json`);
const voxelBin = path.join(outputDir, `${arenaId}.voxel.bin`);
const collisionGlb = path.join(outputDir, `${arenaId}.collision.glb`);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const transformArgs = [
  '-y',
  '@playcanvas/splat-transform@latest',
  '-w',
  '--voxel-params',
  `${round(voxelSize)},${opacity}`,
  '--seed-pos',
  seed
];

if (gpu) {
  transformArgs.push('--gpu', gpu);
}
if (externalFill !== null) {
  transformArgs.push('--voxel-external-fill', String(externalFill));
}
if (floorFill !== null) {
  transformArgs.push('--voxel-floor-fill', String(floorFill));
}
if (carve !== 'none') {
  transformArgs.push('--voxel-carve', carve);
}

const inputActionArgs = [];
if (filterBox) {
  inputActionArgs.push('--filter-box', filterBox);
}
if (filterSphere) {
  inputActionArgs.push('--filter-sphere', filterSphere);
}
if (filterCluster) {
  inputActionArgs.push('--filter-cluster', filterCluster);
}
if (decimate) {
  inputActionArgs.push('--decimate', decimate);
}

transformArgs.push(inputPath, ...inputActionArgs, voxelJson, '--collision-mesh');

console.log(`Splat collision source: ${inputPath}`);
console.log(`Splat collision source size: ${formatBytes(inputSizeBytes)}`);
console.log(`Arena id: ${arenaId}`);
console.log(`Large splat mode: ${largeMode ? 'yes' : 'no'}`);
console.log(`Voxel target resolution: ${resolution}`);
console.log(`Voxel size: ${round(voxelSize)}`);
console.log(`Opacity threshold: ${opacity}`);
if (gpu) console.log(`GPU mode: ${gpu}`);
if (decimate) console.log(`Input decimation: ${decimate}`);
if (filterBox) console.log(`Input filter box: ${filterBox}`);
if (filterSphere) console.log(`Input filter sphere: ${filterSphere}`);
if (filterCluster) console.log(`Input filter cluster: ${filterCluster}`);
console.log(`Voxel output: ${voxelJson}`);
console.log(`Voxel data output: ${voxelBin}`);
console.log(`Collision GLB output: ${collisionGlb}`);
console.log(`Preset voxelCollisionUrl: "/collision/${arenaId}.voxel.json"`);
console.log(`Preset collisionMeshUrl: "/collision/${arenaId}.collision.glb"`);
console.log('');
console.log(formatCommand(npx, transformArgs));

if (dryRun) {
  process.exit(0);
}

const result = runCommand(npx, transformArgs);

if (result.status !== 0) {
  if (result.error) {
    console.error(`Failed to launch splat-transform: ${result.error.message}`);
  }
  if (result.signal) {
    console.error(`splat-transform terminated by signal ${result.signal}`);
  }
  fail(`splat-transform exited with code ${result.status ?? 'unknown'}`);
}

if (!existsSync(voxelJson) || !existsSync(voxelBin)) {
  fail(`Voxel collision files were not found at ${voxelJson} and ${voxelBin}. Check the splat-transform output above.`);
}

if (!existsSync(collisionGlb)) {
  fail(`Collision GLB was not found at ${collisionGlb}. Check the splat-transform output above.`);
}

console.log('');
console.log('Generated voxel collision and collision guide successfully.');
console.log(`Update your preset with: "voxelCollisionUrl": "/collision/${arenaId}.voxel.json"`);
console.log(`Update your preset with: "collisionMeshUrl": "/collision/${arenaId}.collision.glb"`);
console.log('Remember: the GLB is only a visual guide. Gameplay collision uses voxelCollision plus editable manual walls and erasers.');

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index++) {
    const raw = argv[index];
    if (!raw.startsWith('--')) continue;
    const [rawKey, inlineValue] = raw.slice(2).split('=', 2);
    const key = toCamelCase(rawKey);
    if (rawKey.startsWith('no-')) {
      parsed[toCamelCase(rawKey.slice(3))] = false;
      continue;
    }
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      parsed[key] = next;
      index++;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function numberOption(value, fallback) {
  if (value === undefined || value === true || value === false) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function optionalNumberOption(value, fallback) {
  if (value === false || value === 'none') return null;
  return numberOption(value, fallback);
}

function stringOption(value, fallback) {
  if (value === undefined || value === true || value === false) return fallback;
  const text = String(value).trim();
  return text.length > 0 ? text : fallback;
}

function sanitizeArenaId(value) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'splat-arena';
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function round(value) {
  return Math.round(value * 100000) / 100000;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const mib = bytes / (1024 * 1024);
  return `${Math.round(mib * 10) / 10} MiB`;
}

function runCommand(command, args) {
  if (process.platform !== 'win32') {
    return spawnSync(command, args, {
      cwd: repoRoot,
      stdio: 'inherit'
    });
  }

  // Node 24 can throw EINVAL when spawnSync launches .cmd files directly on
  // Windows. Run through cmd.exe so npx.cmd starts reliably from PowerShell,
  // npm scripts, and the local dev endpoint.
  return spawnSync('cmd.exe', ['/d', '/s', '/c', formatCommand(command, args)], {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsVerbatimArguments: true
  });
}

function formatCommand(command, args) {
  return [command, ...args].map(quoteArg).join(' ');
}

function quoteArg(value) {
  const stringValue = String(value);
  return /[\s&()^|<>"]/.test(stringValue) ? `"${stringValue.replaceAll('"', '\\"')}"` : stringValue;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printUsage() {
  console.log(`
Generate SuperSplat/SOG voxel collision and a visual collision guide GLB.

Usage:
  npm run splat:collision -- --input client/public/splats/<arena>.sog --arena <arena-id>

Options:
  --input <path>             SOG or PLY source file.
  --arena <id>               Output arena id. Defaults to input filename.
  --output-dir <path>        Defaults to client/public/collision.
  --resolution <number>      Target voxel resolution. Defaults to 256.
  --world-span <number>      World span used to derive voxel size. Defaults to 12.8.
  --voxel-size <number>      Overrides resolution/world-span derived voxel size.
  --opacity <number>         Voxel opacity threshold. Defaults to 0.1.
  --large                    Preset for very large SOGs: 1% decimation, 0.3 voxel size,
                             0.35 opacity, no fill, no carve.
  --decimate <n|n%>          Decimate the input before voxelizing, e.g. 1% or 250000.
  --gpu <index|cpu>          Forwarded to splat-transform. Use cpu to avoid WebGPU loss.
  --filter-box <x,y,z,X,Y,Z> Keep only splats inside a box before voxelizing.
  --filter-sphere <x,y,z,r>  Keep only splats inside a sphere before voxelizing.
  --filter-cluster <a,b,c>   Forwarded to splat-transform filter-cluster.
  --allow-huge               Force direct whole-map processing for SOGs over 120 MiB.
  --seed <x,y,z>             Seed position for voxel carving. Defaults to 0,0,0.
  --carve <h,r>              Capsule carve height/radius. Defaults to 1.7,0.3.
  --external-fill <number>   Defaults to 1.6. Use --no-external-fill to skip.
  --floor-fill <number>      Defaults to 1.6. Use --no-floor-fill to skip.
  --dry-run                  Print the splat-transform command without running it.

The generated GLB is a calibration guide only. Magic Casters gameplay collision
uses preset voxelCollisionUrl plus manual collisionWalls and collisionErasers.
`);
}
