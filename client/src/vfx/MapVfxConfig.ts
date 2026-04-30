export interface MapVfxEntry {
  id: string;
  vfxId: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: number;
}

export interface MapVfxConfig {
  presetId: string;
  effects: MapVfxEntry[];
}

export async function loadMapVfxConfig(presetId: string): Promise<MapVfxConfig | null> {
  try {
    const response = await fetch(`/vfx/maps/${presetId}-vfx.json`, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    return normalizeMapVfxConfig(data);
  } catch {
    return null;
  }
}

export function normalizeMapVfxConfig(data: unknown): MapVfxConfig {
  const record = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
  const effects = Array.isArray(record.effects)
    ? record.effects.map((e) => normalizeMapVfxEntry(e)).filter((e): e is MapVfxEntry => Boolean(e))
    : [];
  return {
    presetId: typeof record.presetId === 'string' ? record.presetId : 'unknown',
    effects
  };
}

function normalizeMapVfxEntry(data: unknown): MapVfxEntry | null {
  const record = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
  const id = typeof record.id === 'string' ? record.id : '';
  const vfxId = typeof record.vfxId === 'string' ? record.vfxId : '';
  if (!id || !vfxId) return null;
  return {
    id,
    vfxId,
    position: normalizeVector(record.position),
    rotation: normalizeVector(record.rotation),
    scale: typeof record.scale === 'number' && Number.isFinite(record.scale) ? record.scale : 1
  };
}

function normalizeVector(data: unknown): { x: number; y: number; z: number } {
  const record = data && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
  return {
    x: typeof record.x === 'number' && Number.isFinite(record.x) ? record.x : 0,
    y: typeof record.y === 'number' && Number.isFinite(record.y) ? record.y : 0,
    z: typeof record.z === 'number' && Number.isFinite(record.z) ? record.z : 0
  };
}
