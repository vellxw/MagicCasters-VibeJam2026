import { createVoxelCollisionFromData, type SparseVoxelCollision, type VoxelMetadata } from '../../../shared/voxelCollision';

export async function loadVoxelCollisionFromUrl(url: string): Promise<SparseVoxelCollision> {
  const metadataResponse = await fetch(url, { cache: 'no-store' });
  if (!metadataResponse.ok) {
    throw new Error(`Voxel metadata failed: ${metadataResponse.status}`);
  }

  const metadata = await metadataResponse.json() as VoxelMetadata;
  const binUrl = url.replace(/\.voxel\.json$/i, '.voxel.bin');
  if (binUrl === url) {
    throw new Error('Voxel URL must end with .voxel.json');
  }

  const dataResponse = await fetch(binUrl, { cache: 'no-store' });
  if (!dataResponse.ok) {
    throw new Error(`Voxel data failed: ${dataResponse.status}`);
  }

  return createVoxelCollisionFromData(metadata, await dataResponse.arrayBuffer());
}
