/**
 * The client's effect definitions (public/fx/client/effects.json, written by
 * scripts/lc/client-effects.mjs from Effect.dat, skills.lod and the class .bae files).
 */

export interface Track<T> {
  time: number
  value: T
}

/** CParticlesProcessDynamicState and its sibling processes (CParticleGroup::CreateProcess). */
export type ParticleProcessDef =
  | {
      kind: 'dynamic'
      twinkle?: number
      fadeIn: number
      fadeOut: number
      color: Track<number>[]
      alpha: Track<number>[]
      texPos: Track<[number, number]>[]
      size: Track<[number, number]>[]
      mass: Track<number>[]
      deltaPos: Track<[number, number, number]>[]
      angle: Track<number[]>[]
    }
  | { kind: 'force'; forces: ForceDef[] }
  | {
      kind: 'pointGoal'
      lerpRatio: number
      lerpSpeed: number
      speed: number
      point: [number, number, number]
      tag: string
    }
  | {
      kind: 'control'
      type: number
      useParticlePosition: boolean
      angleSpeed: number
      heightSpeed: number
      dependRadius: boolean
    }
  | { kind: 'velocity'; direction: [number, number, number]; speed: number }

export interface ForceDef {
  type: number
  power: number
  position: [number, number, number]
  direction: [number, number, number]
}

export interface ParticlePrototypeDef {
  life: [number, number]
  width: [number, number]
  height: [number, number]
  row: number
  col: number
  mass: [number, number]
  color: [number, number]
  quaternion: { w: [number, number]; x: [number, number]; y: [number, number]; z: [number, number] }
}

interface EmitterBase {
  type: number
  totalCount: number
  countPerSecond: number
  particle: ParticlePrototypeDef
  local: boolean
}
export type EmitterDef =
  | (EmitterBase & {
      kind: 'sphere'
      force: ForceDef
      delay: number
      shape: { radiusOuter: number; radiusInner: number; center: [number, number, number] }
    })
  | (EmitterBase & {
      kind: 'cone'
      speed: [number, number]
      useShapePosition: boolean
      useShapeSpeed: boolean
      shape: {
        heightUpper: number
        heightLower: number
        hotspot: number
        falloff: number
        center: [number, number, number]
        closeRange: number
        lerpRatio: number
      }
    })
  | (EmitterBase & {
      kind: 'cylinder'
      speed: [number, number]
      useShapePosition: boolean
      useShapeSpeed: boolean
      emitAllDirections: boolean
      shape: {
        height: number
        radiusInner: number
        radiusOuter: number
        center: [number, number, number]
      }
    })

/** PTGR: one particle system of the client. */
export interface ParticleGroupDef {
  name: string
  texture: string
  /** PARTICLE_RENDER_TYPE: 0 quad, 1 line, 2 trail, 3 trail along the velocity. */
  render: number
  /** PredefinedBlendType: 203 blend, 205 add, 206 add with alpha, 208 inverse multiply. */
  blend: number
  mexWidth: number
  mexHeight: number
  col: number
  row: number
  processes: ParticleProcessDef[]
  emitter: EmitterDef | null
  absorption: { type: number; move: number; dependLife: boolean; kind: string } | null
}

/** CEffectControl: the tracks an MDL / SKA effect follows over its life. */
export interface EffectControlDef {
  twinkle: number
  fadeIn: number
  fadeOut: number
  color: Track<number>[]
  alpha: Track<number>[]
  stretch: Track<number[]>[]
  position: Track<number[]>[]
  angle: Track<number[]>[]
}

/** EFCT: one effect; kinds without a reader keep only their header (`unsupported`). */
export interface EffectDef {
  name: string
  kind: string
  lifeTime: number
  repeat: number
  fadeIn: number
  fadeOut: number
  unsupported?: boolean
  /** EFPT */
  particleGroup?: string
  /** EOTT_NONE 0, EOTT_START 1, EOTT_ALWAYS 2 (how the attach tag turns the effect). */
  rotation?: number
  /** EFMD / EFSK / EFTC / EFSP */
  model?: string
  texture?: string
  color?: number
  stretch?: number[]
  position?: number
  control?: EffectControlDef | null
  overDraw?: boolean
}

/** EEGM: an effect group, its effects started at times on the tags of the same index. */
export interface EffectGroupDef {
  effects: { time: number; name: string }[]
  tags: { time: number; effect: number; name: string }[]
}

/** What a skill plays (skills.lod and the class .bae of its clips). */
export interface SkillFxDef {
  ready?: string
  /** FireEffect1, on the caster when the release starts. */
  fire: string[]
  /** FireEffect2: the missile's group, flying to the target (CSkill missile types). */
  missile?: string
  /** FireEffect3: on the target at each hit. */
  hit?: string
  after?: string
  projectile?: { type: number; speed: number; delays: number[] }
  clips?: Record<'ready' | 'still' | 'fire', { group: string; delay: number }[]>
}

/** A texture of the effects; model texture vertices are divided by its size in mex. */
export interface FxTextureDef {
  url: string
  width: number
  height: number
  mexWidth?: number
  mexHeight?: number
}

/** One surface of an effect model: its triangles and how they are drawn (Model_internal.h). */
export interface ModelSurfaceDef {
  /** SurfaceTranslucencyType: 0 opaque, 1 translucent, 3 add, 4 transparent, 5 inverse multiply. */
  translucency: number
  doubleSided: boolean
  /** 0xRRGGBBAA */
  color: number
  index: number[]
}

/** An effect model (.mdl, scripts/lc/mdl.mjs): the first mip, every frame, the first animation. */
export interface ModelDef {
  /** 0 a normal model, 1 faces the viewer (MF_FACE_FORWARD), 2 turns about its up axis (half). */
  faceForward: number
  /** Positions per frame, three numbers a vertex, in metres. */
  frames: number[][]
  /** Texture vertices in mex, two a vertex. */
  uv: number[]
  surfaces: ModelSurfaceDef[]
  anim: { secsPerFrame: number; frames: number[] } | null
}

export interface ClientFxData {
  skills: Record<string, SkillFxDef>
  groups: Record<string, EffectGroupDef>
  effects: Record<string, EffectDef>
  particles: Record<string, ParticleGroupDef>
  textures: Record<string, FxTextureDef>
  models?: Record<string, ModelDef>
  /** EFSK: the .smc models as GLB (public/fx/client/ska). */
  skaModels?: Record<string, { url: string; sha256: string }>
}

let loading: Promise<ClientFxData | null> | null = null
let loaded: ClientFxData | null = null

/** The data once it has arrived (null before, or when the file is missing). */
export function clientFx(): ClientFxData | null {
  return loaded
}

/** Fetches the effect data once; later calls share the same request. */
export function loadClientFx(): Promise<ClientFxData | null> {
  loading ??= fetch(`${import.meta.env.BASE_URL}fx/client/effects.json?v=3`)
    .then((r) => (r.ok ? (r.json() as Promise<ClientFxData>) : null))
    .then((data) => (loaded = data))
    .catch(() => null)
  return loading
}

/** For tests: use data directly. */
export function setClientFx(data: ClientFxData | null): void {
  loaded = data
  loading = Promise.resolve(data)
}
