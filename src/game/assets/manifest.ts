/**
 * Typed access to manifest.json. Swapping a model = editing one entry there:
 * file, scale, tint and the mapping from logical animations to clip names in the GLB.
 */
import rawManifest from './manifest.json'

export type LogicalAnimation = 'idle' | 'run' | 'attack' | 'hit' | 'die' | 'victory'

export interface ModelEntry {
  id: string
  /** File name relative to the asset base URL. */
  file: string
  scale: number
  /** Logical animation → clip name in the GLB. idle/run/attack/die are required. */
  animations: Partial<Record<LogicalAnimation, string>> &
    Record<'idle' | 'run' | 'attack' | 'die', string>
  /** Seconds into the attack clip when the blow visually lands. */
  attackImpact: number
  /** Material name → replacement base color. */
  tint: Record<string, string>
}

const REQUIRED: LogicalAnimation[] = ['idle', 'run', 'attack', 'die']

function validate(entry: unknown, index: number): ModelEntry {
  const e = entry as Partial<ModelEntry>
  const where = `manifest.json models[${index}]${e?.id ? ` (${e.id})` : ''}`
  if (!e || typeof e.id !== 'string' || typeof e.file !== 'string')
    throw new Error(`${where}: "id" and "file" are required`)
  if (typeof e.scale !== 'number' || e.scale <= 0) throw new Error(`${where}: "scale" must be > 0`)
  for (const anim of REQUIRED)
    if (typeof e.animations?.[anim] !== 'string')
      throw new Error(`${where}: missing animation "${anim}"`)
  return {
    id: e.id,
    file: e.file,
    scale: e.scale,
    animations: e.animations as ModelEntry['animations'],
    attackImpact: typeof e.attackImpact === 'number' ? e.attackImpact : 0.3,
    tint: e.tint ?? {},
  }
}

const MODELS = new Map(
  (rawManifest.models as unknown[]).map((entry, i) => {
    const model = validate(entry, i)
    return [model.id, model] as const
  }),
)

export function getModel(id: string): ModelEntry {
  const model = MODELS.get(id)
  if (!model) throw new Error(`Model "${id}" is not in manifest.json`)
  return model
}

export function listModels(): ModelEntry[] {
  return [...MODELS.values()]
}

/** Bundled CC0 models by default; VITE_ASSET_BASE_URL points elsewhere (e.g. local assets). */
export const ASSET_BASE_URL: string =
  import.meta.env.VITE_ASSET_BASE_URL ?? `${import.meta.env.BASE_URL}models/`

export function modelUrl(model: ModelEntry): string {
  const base = ASSET_BASE_URL.endsWith('/') ? ASSET_BASE_URL : `${ASSET_BASE_URL}/`
  return `${base}${model.file}`
}
