/** Source-backed, local cylinder quad particles for the eff_name title family. */
export interface ParticleTrack<T> {
  time: number
  value: T
}
export interface TitleParticleGroup {
  name: string
  blend: number
  textureAsset: string
  mexWidth: number
  mexHeight: number
  col: number
  row: number
  processes: {
    kind: string
    fadeIn?: number
    fadeOut?: number
    alpha?: ParticleTrack<number>[]
    size?: ParticleTrack<number[]>[]
    angle?: ParticleTrack<number[]>[]
  }[]
  emitter: {
    countPerSecond: number
    totalCount: number
    speed: number[]
    particle: { life: number[]; width: number[]; color: number[] }
    shape: { center: number[]; height: number; radiusInner: number; radiusOuter: number }
  }
}

/** CSampleSpline<T, linear> uses seconds and each track's own repeating period. */
export function titleSample<T extends number | number[]>(
  samples: readonly ParticleTrack<T>[],
  age: number,
  fallback: T,
  repeat = true,
): T {
  if (!samples.length) return fallback
  const first = samples[0]!,
    last = samples[samples.length - 1]!
  const period = last.time - first.time
  const time = repeat && period > 0 ? age % period : age
  if (time <= first.time) return first.value
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!,
      b = samples[i]!
    if (time > b.time) continue
    const amount = b.time === a.time ? 0 : (time - a.time) / (b.time - a.time)
    if (typeof a.value === 'number' && typeof b.value === 'number')
      return (a.value + (b.value - a.value) * amount) as T
    return (a.value as number[]).map(
      (value, index) => value + (((b.value as number[])[index] ?? value) - value) * amount,
    ) as T
  }
  return last.value
}
export function titleParticleCount(group: TitleParticleGroup): number {
  return Math.ceil(group.emitter.countPerSecond * Math.max(...group.emitter.particle.life))
}
const random = (seed: number) => {
  let value = seed | 0
  return () => {
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
    value ^= value >>> 16
    return (value >>> 0) / 0x100000000
  }
}
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount
const rgba = (color: number) => [
  color >>> 24,
  (color >>> 16) & 255,
  (color >>> 8) & 255,
  color & 255,
]

/** Fixed slots retain source emission rate/lifetime without per-frame allocation of particles. */
export function titleParticle(group: TitleParticleGroup, index: number, time: number) {
  const emitter = group.emitter,
    count = titleParticleCount(group)
  const generation = Math.floor((time * emitter.countPerSecond - index) / count)
  if (generation < 0) return null
  const emitted = index + generation * count,
    age = time - emitted / emitter.countPerSecond
  const rng = random(emitted * 7919 + group.name.length * 313 + 1)
  const life = lerp(emitter.particle.life[0]!, emitter.particle.life[1]!, rng())
  if (age >= life) return null
  const shape = emitter.shape,
    angle = rng() * Math.PI * 2
  const radius = Math.sqrt(lerp(shape.radiusInner ** 2, shape.radiusOuter ** 2, rng()))
  const position = [
    shape.center[0]! + Math.cos(angle) * radius,
    shape.center[1]! +
      rng() * shape.height +
      age * lerp(emitter.speed[0]!, emitter.speed[1]!, rng()),
    shape.center[2]! + Math.sin(angle) * radius,
  ] as const
  const tint = rng(),
    from = rgba(emitter.particle.color[0]!),
    to = rgba(emitter.particle.color[1]!)
  // Source interpolates packed RGBA with one common random ratio.
  const color = from.map((value, channel) => Math.trunc(lerp(value, to[channel]!, tint)))
  const state = group.processes.find((process) => process.kind === 'dynamic')
  const rawAlpha = titleSample(state?.alpha ?? [], age, color[3]!)
  const fadeIn = state?.fadeIn ?? 0,
    fadeOut = state?.fadeOut ?? 0
  const fade = age < fadeIn ? age / fadeIn : life - age < fadeOut ? (life - age) / fadeOut : 1
  const alpha = Math.trunc(rawAlpha * fade) / 255
  const initialSize = lerp(emitter.particle.width[0]!, emitter.particle.width[1]!, rng())
  const size = titleSample(state?.size ?? [], age, [initialSize, initialSize])
  const orientation = titleSample(state?.angle ?? [], age, [0, 0, 0], false)
  // RenderQuad uses +/- width, ignores height, and reduces the quaternion to its angle.
  return {
    position,
    diameter: 2 * size[0]!,
    color,
    alpha,
    rotation: (Math.abs(orientation[0]!) * Math.PI) / 180,
    age,
    life,
  }
}
