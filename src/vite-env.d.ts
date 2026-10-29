/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for 3D assets. Defaults to the bundled CC0 assets under `${BASE_URL}models/`. */
  readonly VITE_ASSET_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** "0" = ignore the generated LC data and models (src/game/data/generated/) and use placeholders. */
  readonly VITE_LC_DATA?: string
}
