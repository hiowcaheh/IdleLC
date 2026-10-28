/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for 3D assets. Defaults to the bundled CC0 assets under `${BASE_URL}models/`. */
  readonly VITE_ASSET_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __APP_VERSION__: string
