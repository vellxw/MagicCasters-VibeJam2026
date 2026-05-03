/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ASSET_BASE_URL?: string;
  readonly VITE_AUTH_API_URL?: string;
  readonly VITE_COLYSEUS_URL?: string;
  readonly VITE_DEFAULT_SPLAT_QUALITY?: 'low' | 'mid' | 'high';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
