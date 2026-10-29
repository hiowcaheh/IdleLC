/**
 * Optional LC data generated locally by `npm run import-lc-db` (git-ignored).
 * Used only when VITE_LC_DATA=1; otherwise — e.g. on the public GitHub Pages build, where the files
 * don't exist — the game keeps its placeholder data.
 */
import type { LcData, LcModelManifest } from './lcTypes.ts'

const dataFiles = import.meta.glob<LcData>('./generated/lc-data.json', {
  eager: true,
  import: 'default',
})
const modelFiles = import.meta.glob<LcModelManifest>('./generated/lc-models.json', {
  eager: true,
  import: 'default',
})

const enabled = import.meta.env.VITE_LC_DATA === '1'

export const lcData: LcData | null = enabled ? (Object.values(dataFiles)[0] ?? null) : null
export const lcModels: LcModelManifest | null = enabled
  ? (Object.values(modelFiles)[0] ?? null)
  : null
