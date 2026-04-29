export type DeviceTier = 'low' | 'medium' | 'high';

let cachedTier: DeviceTier | null = null;

/**
 * Detecta el tier de hardware del dispositivo del usuario.
 * Basado en: hardwareConcurrency, deviceMemory, mobile UA, y capacidades GPU básicas.
 * Cachea el resultado para evitar re-computación.
 */
export function getDeviceTier(): DeviceTier {
  if (cachedTier) return cachedTier;

  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(ua);

  const cores = navigator.hardwareConcurrency || 2;
  const memory = (navigator as any).deviceMemory || 4;

  // GPU básica: detectar si es GPU integrada típica de gama baja
  const gl = document.createElement('canvas').getContext('webgl');
  let gpuTier = 2; // default medium
  if (gl) {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
      const rendererStr = String(renderer).toLowerCase();
      const vendorStr = String(vendor).toLowerCase();

      // GPUs integradas de gama baja conocidas
      const lowEndGPUs = [
        'mali-g31', 'mali-g51', 'mali-g52', 'mali-g57 mc1', 'mali-g57 mc2',
        'adreno 304', 'adreno 306', 'adreno 308', 'adreno 505', 'adreno 506',
        'adreno 509', 'adreno 610', 'adreno 612', 'powervr', 'intel hd graphics 500',
        'intel hd graphics 505', 'intel hd graphics 510', 'intel hd graphics 520'
      ];
      if (lowEndGPUs.some(g => rendererStr.includes(g))) {
        gpuTier = 0;
      } else if (rendererStr.includes('mali-g76') || rendererStr.includes('mali-g77') ||
                 rendererStr.includes('adreno 640') || rendererStr.includes('adreno 650') ||
                 rendererStr.includes('apple gpu') || vendorStr.includes('nvidia')) {
        gpuTier = 3;
      }
    }
    // Si no hay debug info, asumir mobile = potencialmente bajo
    if (gpuTier === 2 && isMobile) gpuTier = 1;
  }

  // Reglas de tier
  if (
    gpuTier <= 0 ||
    (isMobile && (memory <= 2 || cores <= 4)) ||
    memory <= 2 ||
    cores <= 2
  ) {
    cachedTier = 'low';
  } else if (
    gpuTier <= 1 ||
    (isMobile && (memory <= 4 || cores <= 6)) ||
    memory <= 4 ||
    cores <= 4
  ) {
    cachedTier = 'medium';
  } else {
    cachedTier = 'high';
  }

  return cachedTier;
}

export function clearDeviceTierCache(): void {
  cachedTier = null;
}
