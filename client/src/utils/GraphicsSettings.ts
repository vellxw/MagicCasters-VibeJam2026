import { getDeviceTier, type DeviceTier } from './DeviceTier';
import type { SplatQuality } from '../../../shared/splatMapPool';

export type GraphicsTier = DeviceTier | 'auto';

const GRAPHICS_TIER_KEY = 'mc_graphics_tier';

export function loadGraphicsTier(): GraphicsTier | null {
  const raw = localStorage.getItem(GRAPHICS_TIER_KEY);
  if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'auto') {
    return raw;
  }
  return null;
}

export function saveGraphicsTier(tier: GraphicsTier): void {
  localStorage.setItem(GRAPHICS_TIER_KEY, tier);
}

export function clearGraphicsTier(): void {
  localStorage.removeItem(GRAPHICS_TIER_KEY);
}

export function hasSavedGraphicsTier(): boolean {
  return loadGraphicsTier() !== null;
}

export function resolveEffectiveTier(): DeviceTier {
  const saved = loadGraphicsTier();
  if (saved && saved !== 'auto') {
    return saved;
  }
  return getDeviceTier();
}

export function tierToSplatQuality(tier: DeviceTier): SplatQuality {
  if (tier === 'low') return 'low';
  if (tier === 'medium') return 'mid';
  return 'high';
}

export function splatQualityToTier(quality: SplatQuality): DeviceTier {
  if (quality === 'low') return 'low';
  if (quality === 'mid') return 'medium';
  return 'high';
}
