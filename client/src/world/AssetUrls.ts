const ASSET_BASE_URL = normalizeAssetBaseUrl(import.meta.env.VITE_ASSET_BASE_URL as string | undefined);

const REMOTE_ASSET_PREFIXES = [
  '/collision/',
  '/map-previews/',
  '/models/',
  '/splats/'
];

export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (!ASSET_BASE_URL || !isRemoteAssetPath(path)) return path;
  return `${ASSET_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getDefaultSplatQuality(): 'low' | 'mid' | 'high' {
  const value = import.meta.env.VITE_DEFAULT_SPLAT_QUALITY as string | undefined;
  return value === 'low' || value === 'mid' || value === 'high' ? value : 'mid';
}

function isRemoteAssetPath(path: string): boolean {
  if (/^https?:\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return false;
  return REMOTE_ASSET_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function normalizeAssetBaseUrl(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, '') ?? '';
}
