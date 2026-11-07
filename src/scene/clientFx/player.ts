/**
 * CEffectGroup: an effect group of the client played on a character's tags. Each of its effects
 * starts at its own time on the tag of the same index (EGEK / EGTK) and lives its lifeTime,
 * repeating as often as it says. Particle effects (EFPT) run a ParticleSystem, model effects
 * (EFMD) a model with its control tracks; the other kinds are left to later readers and simply
 * take their time.
 */
import type { ClientFxData, EffectDef, FxTextureDef, ModelDef } from './data.ts'
import { TrailState } from './trail.ts'
import { modelLook, modelPlacement } from './modelEffect.ts'
import { orbitPoints, type OrbitFrame } from './orbit.ts'
import {
  IDENTITY,
  ParticleSystem,
  randomTable,
  type Placement,
  type Quat,
  type TagLookup,
  type Vec3,
} from './particles.ts'

/** A running particle effect, for the renderer. */
export interface LiveParticles {
  system: ParticleSystem
  texture: string
}

/** A running model effect, for the renderer: what it is and how it stands this frame. */
export interface LiveModel {
  def: EffectDef
  model: ModelDef
  texture: FxTextureDef
  /** Seconds since it (re)started. */
  age: number
  /** 0xRRGGBBAA */
  color: number
  stretch: Vec3
  position: Vec3
  rotation: Quat
}

/** A running SKA model effect (EFSK), for the renderer. */
export interface LiveSka {
  def: EffectDef
  url: string
  /** Seconds since it (re)started: the time of its looping first animation. */
  age: number
  /** 0xRRGGBBAA */
  color: number
  stretch: Vec3
  position: Vec3
  rotation: Quat
}

/** A running trail (EFSB, EFTC), for the renderer. */
export interface LiveTrail {
  state: TrailState
  texture: FxTextureDef | null
  /** PredefinedBlendType (PBT_ADDALPHA when the file has none). */
  blend: number
  /** The group tag a two-point trail spans (its __0_ and __1_ points). */
  span?: string
}

/** Group tags of the weapons: a trail on one spans its two points (CGroupTag of two tags). */
const SPANNED = /^(SWORD|RDAGGER|LDAGGER|AXE|LDSWORD|RDSWORD|CUTTER|ARROW)$/

interface Running {
  def: EffectDef
  tag: string
  /** Seconds of its life left (m_fLeftTime). */
  left: number
  /** Seconds since it (re)started (the processed time its tracks are read at). */
  age: number
  repeat: number
  particles?: LiveParticles
  model?: LiveModel
  ska?: LiveSka
  trail?: LiveTrail
  /** EFOB: where its orbits are, which of their effects have started. */
  orbit?: { frame: OrbitFrame; points: Vec3[]; started: boolean[] }
  /** The tags it stands on: the character's, or an orbit's moving point. */
  lookup?: TagLookup
  /** An orbit's effect ends with its orbit (COrbitEffect::ClearInstance). */
  parent?: Running
  ended?: boolean
  /** Where the tag was and how it was turned at the first process (m_bOnlyStart). */
  start?: Placement
  /** EOTT_START: the tag's turn when it started. */
  startRotation?: Quat
}

export class EffectGroupPlayer {
  private elapsed = 0
  private next = 0
  private running: Running[] = []
  private readonly keys: { time: number; effect: EffectDef | undefined; tags: string[] }[]
  /** Infinite repeats (auras) run until stop(). */
  private stopped = false

  readonly name: string
  private readonly tags: TagLookup

  constructor(name: string, data: ClientFxData, tags: TagLookup) {
    this.name = name
    this.tags = tags
    const group = data.groups[name]
    this.keys = (group?.effects ?? [])
      .map((e, i) => ({
        time: e.time,
        effect: data.effects[e.name],
        tags: group!.tags.filter((t) => t.effect === i).map((t) => t.name),
      }))
      .sort((a, b) => a.time - b.time)
    this.data = data
  }
  private readonly data: ClientFxData
  private readonly spawned: Running[] = []

  /** The particle effects alive now. */
  particles(): LiveParticles[] {
    return this.running.flatMap((r) => (r.particles ? [r.particles] : []))
  }

  /** The model effects alive now. */
  models(): LiveModel[] {
    return this.running.flatMap((r) => (r.model ? [r.model] : []))
  }

  /** The trails alive now. */
  trails(): LiveTrail[] {
    return this.running.flatMap((r) => (r.trail ? [r.trail] : []))
  }

  /** The SKA model effects alive now. */
  skaModels(): LiveSka[] {
    return this.running.flatMap((r) => (r.ska ? [r.ska] : []))
  }

  /**
   * CEffectGroup::Stop: effects not started yet never start; running ones repeat no more and end
   * within `leftTime` seconds, or over their own fade-out time when it is negative (CEffect::Stop);
   * particle emitters stop at once.
   */
  stop(leftTime = -1): void {
    this.stopped = true
    this.next = this.keys.length
    for (const r of this.running) {
      r.repeat = 0
      r.particles?.system.stop()
      const cut = leftTime < 0 ? r.def.fadeOut : leftTime
      if (r.left > cut) r.left = cut
    }
  }

  /** Advances the group; false once every effect has ended. */
  update(dt: number): boolean {
    this.elapsed += dt
    this.running = this.running.filter((r) => this.process(r, dt))
    // effects an orbit started during this step
    this.running.push(...this.spawned.splice(0))
    // effects due now start with the part of this step they are late by
    while (this.next < this.keys.length && this.keys[this.next]!.time <= this.elapsed) {
      const key = this.keys[this.next++]!
      if (key.effect) this.start(key.effect, key.tags, this.elapsed - key.time)
    }
    return this.next < this.keys.length || this.running.length > 0
  }

  private start(
    def: EffectDef,
    tags: string[],
    late: number,
    lookup: TagLookup = this.tags,
    parent?: Running,
  ) {
    // a group tag (__0_X / __1_X) stands at its first point
    const tag = tags.find((t) => t.startsWith('__0_')) ?? tags[0]
    if (!tag) return
    const at = lookup(tag)
    if (!at) return // the client skips an effect whose tag the character lacks
    const running: Running = {
      def,
      tag,
      left: def.lifeTime,
      age: 0,
      repeat: def.repeat,
      ...(lookup !== this.tags ? { lookup } : {}),
      ...(parent ? { parent } : {}),
    }
    if ((def.kind === 'EFSB' || def.kind === 'EFTC') && !def.unsupported) {
      // CTraceEffect needs a group tag of two points; a spline billboard spans one when it has it
      const span = SPANNED.test(tag) ? tag : undefined
      if (def.kind === 'EFSB' || span)
        running.trail = {
          state: new TrailState(def, !!span),
          texture: def.texture ? (this.data.textures[def.texture] ?? null) : null,
          blend: def.blend ?? 206,
          ...(span ? { span } : {}),
        }
    }
    if (def.kind === 'EFOB' && def.orbits?.length)
      running.orbit = {
        frame: { position: at.position, rotation: IDENTITY, first: true },
        points: def.orbits.map(() => [...at.position] as Vec3),
        started: def.orbits.map(() => false),
      }
    if (def.kind === 'EFPT' && def.particleGroup && !def.unsupported) {
      const group = this.data.particles[def.particleGroup]
      if (group && group.emitter && this.data.textures[group.texture]) {
        running.particles = {
          system: new ParticleSystem(group, randomTable(), lookup),
          texture: group.texture,
        }
        running.startRotation = at.rotation
        this.place(running, at)
      }
    }
    if (def.kind === 'EFMD' && def.model && def.texture) {
      const model = this.data.models?.[def.model]
      const texture = this.data.textures[def.texture]
      // CMdlEffect::Start: a model without animations ends at once
      if (model?.anim && texture)
        running.model = {
          def,
          model,
          texture,
          age: 0,
          color: (def.color ?? 0xffffffff) >>> 0,
          stretch: [1, 1, 1],
          position: at.position,
          rotation: at.rotation,
        }
    }
    if (def.kind === 'EFSK' && def.model) {
      // CSkaEffect: a model the client has no mesh for draws nothing (Invisible.smc)
      const asset = this.data.skaModels?.[def.model]
      if (asset)
        running.ska = {
          def,
          url: `${asset.url}?v=${asset.sha256.slice(0, 12)}`,
          age: 0,
          color: (def.color ?? 0xffffffff) >>> 0,
          stretch: [1, 1, 1],
          position: at.position,
          rotation: at.rotation,
        }
      // CSkaEffect::Start takes the tag's place at once
      running.start = at
    }
    if (late > 0 && !this.process(running, late)) return
    ;(parent ? this.spawned : this.running).push(running)
  }

  private place(r: Running, at: Placement) {
    const mode = r.def.rotation ?? 2
    const rotation =
      mode === 2 ? at.rotation : mode === 1 ? (r.startRotation ?? IDENTITY) : IDENTITY
    r.particles?.system.setPlacement(at.position, rotation)
  }

  /** CEffect::PreProcess and the effect's own Process; false when it has ended. */
  private process(r: Running, dt: number): boolean {
    const alive = !r.parent?.ended && this.step(r, dt)
    if (!alive) r.ended = true
    return alive
  }

  private step(r: Running, dt: number): boolean {
    const lookup = r.lookup ?? this.tags
    r.left -= dt
    r.age += dt
    if (r.left <= 0) {
      if (r.repeat !== 0 && !this.stopped) {
        if (r.repeat > 0) r.repeat--
        r.left += r.def.lifeTime
        r.age -= r.def.lifeTime
        r.particles?.system.restart()
        // a restarted model effect takes the tag's place again (CMdlEffect::Start m_bOnlyStart)
        r.start = undefined
      } else return false
    }
    if (r.particles) {
      const at = lookup(r.tag)
      if (at) this.place(r, at)
      r.particles.system.process(dt)
    }
    if (r.trail) {
      const span = r.trail.span
      const a = lookup(span ? `__0_${span}` : r.tag)
      const b = span ? lookup(`__1_${span}`) : null
      if (a) r.trail.state.process(r.age, r.left, a.position, b?.position ?? null)
    }
    if (r.orbit) this.orbit(r, lookup)
    // model effects (EFMD, EFSK) share CMdlEffect's look and placement rules
    const shown = r.model ?? r.ska
    if (shown) {
      const at = lookup(r.tag)
      r.start ??= at ?? { position: shown.position, rotation: shown.rotation }
      const age = Math.max(0, r.age)
      const look = modelLook(r.def, age, r.left)
      const placed = modelPlacement(r.def, look, r.start, at)
      Object.assign(shown, {
        age,
        color: look.color,
        stretch: look.stretch,
        position: placed.position,
        rotation: placed.rotation,
      })
    }
    return true
  }

  /** COrbitEffect::Process: move the orbits' points, start their effects when they are due. */
  private orbit(r: Running, lookup: TagLookup) {
    const o = r.orbit!
    const def = r.def
    const attach = lookup(r.tag)
    if (!attach) return
    const goal = def.goalTag ? lookup(def.goalTag) : null
    o.points = orbitPoints(def, Math.max(0, r.age), r.left, attach, goal, o.frame)
    def.orbits!.forEach((orbit, i) => {
      if (o.started[i] || r.age < orbit.delay || orbit.effect === def.name) return
      o.started[i] = true
      const child = this.data.effects[orbit.effect]
      if (!child) return
      const at = (): Placement => ({ position: o.points[i]!, rotation: o.frame.rotation })
      this.start(child, ['__ROOT'], r.age - orbit.delay, at, r)
    })
  }
}
