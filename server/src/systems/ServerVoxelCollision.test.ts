import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { invalidateServerVoxelCollision, loadServerVoxelCollision } from './ServerVoxelCollision';

function voxelFixture() {
  return {
    version: '1.1',
    gridBounds: { min: [0, 0, 0], max: [4, 4, 4] },
    sceneBounds: { min: [0, 0, 0], max: [4, 4, 4] },
    voxelResolution: 1,
    leafSize: 4,
    treeDepth: 0,
    numInteriorNodes: 0,
    numMixedLeaves: 1,
    nodeCount: 1,
    leafDataCount: 2
  };
}

describe('server voxel collision loader', () => {
  it('retries a voxel asset after an earlier missing-file miss', async () => {
    const root = await mkdtemp(join(tmpdir(), 'magic-casters-server-voxel-'));
    const collisionDir = join(root, 'client', 'public', 'collision');
    await mkdir(collisionDir, { recursive: true });

    const url = '/collision/retry.voxel.json';
    invalidateServerVoxelCollision(url);
    expect(await loadServerVoxelCollision(url, root)).toBeNull();

    await writeFile(join(collisionDir, 'retry.voxel.json'), JSON.stringify(voxelFixture(), null, 2));
    await writeFile(join(collisionDir, 'retry.voxel.bin'), Buffer.from(new Uint32Array([0xff000000, 0, 0]).buffer));

    const loaded = await loadServerVoxelCollision(url, root);
    expect(loaded).not.toBeNull();
    expect(loaded?.isWorldSolid(0.5, 0.5, 0.5)).toBe(true);
  });

  it('prefers public collision assets over stale dist copies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'magic-casters-server-voxel-priority-'));
    const publicDir = join(root, 'client', 'public', 'collision');
    const distDir = join(root, 'client', 'dist', 'collision');
    await mkdir(publicDir, { recursive: true });
    await mkdir(distDir, { recursive: true });

    const url = '/collision/priority.voxel.json';
    await writeFile(join(distDir, 'priority.voxel.json'), JSON.stringify(voxelFixture(), null, 2));
    await writeFile(join(distDir, 'priority.voxel.bin'), Buffer.from(new Uint32Array([0, 0, 0]).buffer));
    await writeFile(join(publicDir, 'priority.voxel.json'), JSON.stringify(voxelFixture(), null, 2));
    await writeFile(join(publicDir, 'priority.voxel.bin'), Buffer.from(new Uint32Array([0xff000000, 0, 0]).buffer));

    invalidateServerVoxelCollision(url);
    const loaded = await loadServerVoxelCollision(url, root);
    expect(loaded?.isWorldSolid(0.5, 0.5, 0.5)).toBe(true);
  });
});
