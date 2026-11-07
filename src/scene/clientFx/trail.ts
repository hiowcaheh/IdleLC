/**
 * Trails of the client: CSplineBillboardEffect (EFSB, a ribbon behind one point that turns to the
 * viewer, or between two points of a group tag) and CTraceEffect (EFTC, a weapon's swing between
 * the two points of its group tag). Both keep where their points were over the last `traceTime`
 * seconds and draw a strip through those samples, read on a natural cubic spline every `interval`
 * seconds, coloured from the end colour (oldest) to the begin colour (newest) and faded with the
 * effect. Pure, so the rules can be tested; TrailMeshes.ts draws the strip.
 */
import type { EffectDef, Track } from './data.ts'
import { effectFade, sampleSpline } from './modelEffect.ts'
import type { Vec3 } from './particles.ts'

interface Sample {
  time: number
  a: Vec3
  b: Vec3 | null
}

/** A ribbon's vertices: two per step, with their colours (0–1 RGBA) and texture coordinates. */
export interface TrailStrip {
  positions: number[]
  colors: number[]
  uvs: number[]
}

/** A natural cubic spline through samples (CSampleSpline<FLOAT3D, CCubicSplineInterpolate>). */
const spline = (samples: Sample[], pick: (s: Sample) => Vec3) => {
  const track: Track<Vec3>[] = samples.map((s) => ({ time: s.time, value: pick(s) }))
  return (key: number) => sampleSpline(track, key)
}

/** LerpColor256: from `end` toward `begin` by ratio, alpha times the fade (bytes in, 0–1 out). */
function stripColor(end: number, begin: number, ratio: number, fade: number): number[] {
  const lerp = Math.floor(ratio * 255)
  const channel = (shift: number) => {
    const e = (end >>> shift) & 255
    const b = (begin >>> shift) & 255
    return (e * (256 - lerp) + b * lerp) >> 8
  }
  const alpha = Math.floor(
    ((((end & 255) * (256 - lerp) + (begin & 255) * lerp) >>> 0) * Math.floor(fade * 255)) / 65536,
  )
  return [channel(24) / 255, channel(16) / 255, channel(8) / 255, alpha / 255]
}

export class TrailState {
  readonly def: EffectDef
  /** Two points (a group tag): the strip spans them; one point: it turns to the viewer. */
  readonly twin: boolean
  private samples: Sample[] = []
  private fade = 1
  private time = 0

  constructor(def: EffectDef, twin: boolean) {
    this.def = def
    this.twin = twin
  }

  /** CSplineBillboardEffect::Process: forget old samples (faster while fading out), add this one. */
  process(age: number, left: number, a: Vec3, b: Vec3 | null): void {
    const traceTime = this.def.traceTime ?? 0.3
    this.time = age
    this.fade = effectFade(this.def, age, left)
    const keep =
      left < this.def.fadeOut && this.def.fadeOut > 0
        ? age - (traceTime * left) / this.def.fadeOut
        : age - traceTime
    this.samples = this.samples.filter((s) => s.time >= keep)
    if (this.samples.length && this.samples[this.samples.length - 1]!.time >= age)
      this.samples.pop()
    this.samples.push({ time: age, a: [...a], b: b ? [...b] : null })
  }

  /** CSplineBillboardEffect::Render: the strip as seen from `viewer` (null: nothing to draw). */
  strip(viewer: Vec3): TrailStrip | null {
    const samples = this.samples
    const interval = Math.max(0.005, this.def.interval ?? 0.02)
    if (samples.length < 2) return null
    const first = samples[0]!.time
    const last = samples[samples.length - 1]!.time
    let count = Math.floor((last - first) / interval) + 2
    if (count < 2) return null
    const begin = (this.def.colorBegin ?? 0xffffffff) >>> 0
    const end = (this.def.colorEnd ?? 0xffffff00) >>> 0
    const ratioUnit = 1 / Math.max(1, count - 2)
    const out: TrailStrip = { positions: [], colors: [], uvs: [] }
    const atA = spline(samples, (s) => s.a)
    let key = last - count * interval
    let ratio = 0
    const push = (p: Vec3, q: Vec3, i: number) => {
      out.positions.push(...p, ...q)
      const color = stripColor(end, begin, ratio, this.fade)
      out.colors.push(...color, ...color)
      out.uvs.push(1 - ratio, 0, 1 - ratio, 1)
      if (i > 0) ratio = Math.min(1, ratio + ratioUnit)
    }
    if (this.twin && samples.every((s) => s.b)) {
      const atB = spline(samples, (s) => s.b!)
      const velocity = this.def.velocity ?? 0
      for (let i = 0; i < count; i++) {
        key += interval
        const p = atA(key)
        const q = atB(key)
        if (velocity) {
          // the strip drifts away along its points' line (CSplineBillboardEffect m_fVelocity)
          const drift = velocity * (last - key)
          const dir = p.map((v, k) => v - q[k]!)
          push(
            p.map((v, k) => v + dir[k]! * drift) as Vec3,
            q.map((v, k) => v + dir[k]! * drift) as Vec3,
            i,
          )
        } else push(p, q, i)
      }
      return out
    }
    // one point: a band of the effect's width across the path, turned toward the viewer
    count--
    if (count < 2) return null
    const half = (this.def.width ?? 0.5) * 0.5
    key += interval
    let previous = atA(key)
    for (let i = 0; i < count; i++) {
      key += interval
      const p = atA(key)
      const dir = p.map((v, k) => v - previous[k]!) as Vec3
      const length = Math.hypot(...dir) || 1
      const n = dir.map((v) => v / length) as Vec3
      const toViewer = viewer.map((v, k) => v - p[k]!) as Vec3
      const along = toViewer[0] * n[0] + toViewer[1] * n[1] + toViewer[2] * n[2]
      const front = toViewer.map((v, k) => v - n[k]! * along) as Vec3
      const side: Vec3 = [
        front[1] * n[2] - front[2] * n[1],
        front[2] * n[0] - front[0] * n[2],
        front[0] * n[1] - front[1] * n[0],
      ]
      const sideLength = Math.hypot(...side) || 1
      const s = side.map((v) => (v / sideLength) * half) as Vec3
      push(previous.map((v, k) => v + s[k]!) as Vec3, previous.map((v, k) => v - s[k]!) as Vec3, i)
      previous = p
    }
    return out
  }

  /** The newest sample's time (for tests). */
  get latest(): number {
    return this.time
  }
}
