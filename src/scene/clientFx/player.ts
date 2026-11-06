/**
 * CEffectGroup: an effect group of the client played on a character's tags. Each of its effects
 * starts at its own time on the tag of the same index (EGEK / EGTK) and lives its lifeTime,
 * repeating as often as it says. Particle effects (EFPT) run a ParticleSystem; the other kinds
 * are left to later readers and simply take their time.
 */
import type { ClientFxData, EffectDef } from './data.ts'
import {
  IDENTITY,
  ParticleSystem,
  randomTable,
  type Placement,
  type Quat,
  type TagLookup,
} from './particles.ts'

/** A running particle effect, for the renderer. */
export interface LiveParticles {
  system: ParticleSystem
  texture: string
}

interface Running {
  def: EffectDef
  tag: string
  /** Seconds of its life left (m_fLeftTime). */
  left: number
  repeat: number
  particles?: LiveParticles
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

  /** The particle effects alive now. */
  particles(): LiveParticles[] {
    return this.running.flatMap((r) => (r.particles ? [r.particles] : []))
  }

  stop(): void {
    this.stopped = true
    this.next = this.keys.length
    for (const r of this.running) {
      r.repeat = 0
      r.particles?.system.stop()
    }
  }

  /** Advances the group; false once every effect has ended. */
  update(dt: number): boolean {
    this.elapsed += dt
    this.running = this.running.filter((r) => this.process(r, dt))
    // effects due now start with the part of this step they are late by
    while (this.next < this.keys.length && this.keys[this.next]!.time <= this.elapsed) {
      const key = this.keys[this.next++]!
      if (key.effect) this.start(key.effect, key.tags, this.elapsed - key.time)
    }
    return this.next < this.keys.length || this.running.length > 0
  }

  private start(def: EffectDef, tags: string[], late: number) {
    // a group tag (__0_X / __1_X) stands at its first point
    const tag = tags.find((t) => t.startsWith('__0_')) ?? tags[0]
    if (!tag) return
    const at = this.tags(tag)
    if (!at) return // the client skips an effect whose tag the character lacks
    const running: Running = { def, tag, left: def.lifeTime, repeat: def.repeat }
    if (def.kind === 'EFPT' && def.particleGroup && !def.unsupported) {
      const group = this.data.particles[def.particleGroup]
      if (group && group.emitter && this.data.textures[group.texture]) {
        running.particles = {
          system: new ParticleSystem(group, randomTable(), this.tags),
          texture: group.texture,
        }
        running.startRotation = at.rotation
        this.place(running, at)
      }
    }
    if (late <= 0 || this.process(running, late)) this.running.push(running)
  }

  private place(r: Running, at: Placement) {
    const mode = r.def.rotation ?? 2
    const rotation =
      mode === 2 ? at.rotation : mode === 1 ? (r.startRotation ?? IDENTITY) : IDENTITY
    r.particles?.system.setPlacement(at.position, rotation)
  }

  /** CEffect::PreProcess and the effect's own Process; false when it has ended. */
  private process(r: Running, dt: number): boolean {
    r.left -= dt
    if (r.left <= 0) {
      if (r.repeat !== 0 && !this.stopped) {
        if (r.repeat > 0) r.repeat--
        r.left += r.def.lifeTime
        r.particles?.system.restart()
      } else return false
    }
    if (r.particles) {
      const at = this.tags(r.tag)
      if (at) this.place(r, at)
      r.particles.system.process(dt)
    }
    return true
  }
}
