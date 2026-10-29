/**
 * Typed access to manifest.json. Swapping a model = editing one entry there:
 * file, scale, tint and the mapping from logical animations to clip names in the GLB.
 * In LC mode the locally generated LC model manifest is merged on top (see lcSource.ts).
 */
import { lcModels } from '../data/lcSource.ts'
import rawManifest from './manifest.json'

export type LogicalAnimation = 'idle' | 'walk' | 'run' | 'attack' | 'hit' | 'die' | 'victory'

export interface ModelEntry {
  id: string
  /** File name relative to the asset base URL (or to `baseUrl`). */
  file: string
  /** Base URL relative to the app base, overriding ASSET_BASE_URL (LC models). */
  baseUrl?: string
  scale: number
  /** Logical animation → clip name in the GLB. idle/run/attack/die are required. */
  animations: Partial<Record<Exclude<LogicalAnimation, 'attack'>, string>> &
    Record<'idle' | 'run' | 'die', string>
  /** One or more attack clips; several are played in turn. */
  attacks: string[]
  /** Seconds into the attack clip when the blow visually lands. */
  attackImpact: number
  /** Bind-pose size in model units (before `scale`), when known. */
  height?: number
  radius?: number
  /** Material name → replacement base color. */
  tint: Record<string, string>
}

const REQUIRED = ['idle', 'run', 'attack', 'die'] as const

function validate(entry: unknown, where: string, baseUrl?: string): ModelEntry {
  const e = entry as Partial<ModelEntry> & { animations?: Record<string, unknown> }
  if (!e || typeof e.id !== 'string' || typeof e.file !== 'string')
    throw new Error(`${where}: "id" and "file" are required`)
  if (typeof e.scale !== 'number' || e.scale <= 0) throw new Error(`${where}: "scale" must be > 0`)
  const anims: Record<string, unknown> = e.animations ?? {}
  for (const anim of REQUIRED) {
    const v = anims[anim]
    if (!(typeof v === 'string' || (Array.isArray(v) && v.length > 0)))
      throw new Error(`${where} (${e.id}): missing animation "${anim}"`)
  }
  const { attack, ...rest } = anims
  return {
    id: e.id,
    file: e.file,
    baseUrl,
    scale: e.scale,
    animations: rest as ModelEntry['animations'],
    attacks: [attack].flat() as string[],
    attackImpact: typeof e.attackImpact === 'number' ? e.attackImpact : 0.3,
    height: e.height,
    radius: e.radius,
    tint: e.tint ?? {},
  }
}

const MODELS = new Map<string, ModelEntry>()
;(rawManifest.models as unknown[]).forEach((entry, i) => {
  const model = validate(entry, `manifest.json models[${i}]`)
  MODELS.set(model.id, model)
})
const lc = lcModels
lc?.models.forEach((entry, i) => {
  try {
    const model = validate(entry, `lc-models.json models[${i}]`, lc.baseUrl)
    MODELS.set(model.id, model)
  } catch (error) {
    console.warn(error instanceof Error ? error.message : error)
  }
})

export function getModel(id: string): ModelEntry {
  const model = MODELS.get(id)
  if (!model) throw new Error(`Model "${id}" is not in the manifest`)
  return model
}

export function hasModel(id: string): boolean {
  return MODELS.has(id)
}

export function listModels(): ModelEntry[] {
  return [...MODELS.values()]
}

/** Bundled CC0 models by default; VITE_ASSET_BASE_URL points elsewhere (e.g. local assets). */
export const ASSET_BASE_URL: string =
  import.meta.env.VITE_ASSET_BASE_URL ?? `${import.meta.env.BASE_URL}models/`

export function modelUrl(model: ModelEntry): string {
  const base = model.baseUrl
    ? `${import.meta.env.BASE_URL}${model.baseUrl}`
    : ASSET_BASE_URL.endsWith('/')
      ? ASSET_BASE_URL
      : `${ASSET_BASE_URL}/`
  return `${base}${model.file}`
}

/** Player model for a class: the converted LC class model when available, else the CC0 hero. */
export function playerModelId(classId: string): string {
  return hasModel(`class-${classId}`) ? `class-${classId}` : 'hero'
}
