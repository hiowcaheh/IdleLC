/**
 * CMdlEffect (Engine/Effect/CMdlEffect.cpp) with its CEffectControl (CEffectControl.cpp): what a
 * model effect looks like at an age of its life. Pure, so the rules can be tested; the meshes are
 * drawn by ModelMeshes.ts.
 */
import type { EffectControlDef, EffectDef, Track } from './data.ts'
import {
  IDENTITY,
  quatFromEuler,
  quatMultiply,
  rotate,
  sampleColor,
  sampleNumber,
  sampleVector,
  type Quat,
  type Vec3,
} from './particles.ts'

/** CEffect::GetFadeValue: in over the fade-in time, out over the last fade-out seconds. */
export function effectFade(def: Pick<EffectDef, 'fadeIn' | 'fadeOut'>, age: number, left: number) {
  if (age <= def.fadeIn) return def.fadeIn !== 0 ? age / def.fadeIn : 0
  if (left <= def.fadeOut) return def.fadeOut !== 0 ? Math.max(0, left / def.fadeOut) : 0
  return 1
}

/** The age a repeating track is read at: `age − life × floor(age / life)` (life = its key span). */
function repeatAge<T>(track: readonly Track<T>[], age: number): number {
  if (track.length <= 1) return age
  const life = track[track.length - 1]!.time - track[0]!.time
  if (!(life > 0 || life < 0)) return age
  return age - life * Math.trunc(age / life)
}

/**
 * CSampleSpline<FLOAT3D, CCubicSplineInterpolate>: a natural cubic spline through the keys (one
 * parameter unit per segment), Hermite between them. Two keys or fewer have flat ends.
 */
export function sampleSpline(track: readonly Track<readonly number[]>[], key: number): Vec3 {
  const n = track.length
  if (!n) return [0, 0, 0]
  const at = (i: number): Vec3 => [
    track[i]!.value[0] ?? 0,
    track[i]!.value[1] ?? 0,
    track[i]!.value[2] ?? 0,
  ]
  if (key <= track[0]!.time) return at(0)
  if (key >= track[n - 1]!.time) return at(n - 1)
  const tangents: Vec3[] = Array.from({ length: n }, () => [0, 0, 0] as Vec3)
  if (n > 2) {
    const last = n - 1
    const gamma = new Array<number>(n)
    const delta: Vec3[] = new Array(n)
    gamma[0] = 1 / 2
    for (let i = 1; i < last; i++) gamma[i] = 1 / (4 - gamma[i - 1]!)
    gamma[last] = 1 / (2 - gamma[last - 1]!)
    const v = (i: number) => at(i)
    delta[0] = v(1).map((x, k) => (x - v(0)[k]!) * 3 * gamma[0]!) as Vec3
    for (let i = 1; i < last; i++)
      delta[i] = v(i + 1).map(
        (x, k) => ((x - v(i - 1)[k]!) * 3 - delta[i - 1]![k]!) * gamma[i]!,
      ) as Vec3
    delta[last] = v(last).map(
      (x, k) => ((x - v(last - 1)[k]!) * 3 - delta[last - 1]![k]!) * gamma[last]!,
    ) as Vec3
    tangents[last] = delta[last]!
    for (let i = last; i > 0; i--)
      tangents[i - 1] = delta[i - 1]!.map((d, k) => d - gamma[i]! * tangents[i]![k]!) as Vec3
  }
  let i = 1
  while (track[i]!.time < key) i++
  const r = (key - track[i - 1]!.time) / (track[i]!.time - track[i - 1]!.time)
  const r2 = r * r,
    r3 = r2 * r
  const a = at(i - 1),
    b = at(i),
    ta = tangents[i - 1]!,
    tb = tangents[i]!
  return [0, 1, 2].map(
    (k) =>
      a[k]! * (1 - 3 * r2 + 2 * r3) +
      b[k]! * (3 * r2 - 2 * r3) +
      ta[k]! * (r - 2 * r2 + r3) +
      tb[k]! * (-r2 + r3),
  ) as Vec3
}

export interface ModelLook {
  /** 0xRRGGBBAA, the model instance's blend colour. */
  color: number
  stretch: Vec3
  /** The dynamic position, before the effect's turn is applied (null: none). */
  offset: Vec3 | null
  /** The dynamic angle (heading, pitch, banking in degrees; null: none). */
  angle: Vec3 | null
}

/**
 * CMdlEffect::Process: without a control the model's colour with its alpha faded; with one,
 * CEffectControl::Process with the effect's own fade times (CMdlEffect::Start SetFadeTime).
 */
export function modelLook(def: EffectDef, age: number, left: number): ModelLook {
  const base = (def.color ?? 0xffffffff) >>> 0
  const stretch: Vec3 = [def.stretch?.[0] ?? 1, def.stretch?.[1] ?? 1, def.stretch?.[2] ?? 1]
  const control: EffectControlDef | null | undefined = def.control
  if (!control) {
    const alpha = Math.trunc((base & 255) * effectFade(def, age, left))
    return { color: ((base & 0xffffff00) | alpha) >>> 0, stretch, offset: null, angle: null }
  }
  const rgb = control.color.length
    ? sampleColor(control.color, age) & 0xffffff00
    : base & 0xffffff00
  let alpha = 255
  let processed = false
  if (control.alpha.length) {
    processed = true
    alpha = Math.trunc(sampleNumber(control.alpha, repeatAge(control.alpha, age)))
  }
  let twinkle = 1
  if (control.twinkle > 0.0001) {
    processed = true
    const value = Math.floor(age / control.twinkle)
    twinkle =
      value & 1
        ? (age - control.twinkle * value) / control.twinkle
        : (control.twinkle * (value + 1) - age) / control.twinkle
  }
  let fade = 1
  const life = age + left
  if (age <= def.fadeIn && def.fadeIn !== 0) {
    processed = true
    fade = age / def.fadeIn
  } else if (life - age <= def.fadeOut && def.fadeOut !== 0) {
    processed = true
    fade = (life - age) / def.fadeOut
  }
  alpha = processed ? Math.max(0, Math.min(255, Math.trunc(alpha * twinkle * fade))) : base & 255
  return {
    color: (rgb | alpha) >>> 0,
    stretch: control.stretch.length
      ? (sampleVector(control.stretch, repeatAge(control.stretch, age)) as Vec3)
      : stretch,
    offset: control.position.length ? sampleSpline(control.position, age) : null,
    angle: control.angle.length ? (sampleVector(control.angle, age) as Vec3) : null,
  }
}

/**
 * CMdlEffect::Render: where the model stands and how it is turned. The turn comes from the tag
 * (EOTT_ALWAYS), its turn at the start (EOTT_START) or none; the position stays where the effect
 * started unless it follows the tag (EOTT_ALWAYS). A dynamic position is turned with the effect,
 * a dynamic angle is added to its turn.
 */
export function modelPlacement(
  def: Pick<EffectDef, 'rotation' | 'position'>,
  look: Pick<ModelLook, 'offset' | 'angle'>,
  start: { position: Vec3; rotation: Quat },
  tag: { position: Vec3; rotation: Quat } | null,
): { position: Vec3; rotation: Quat } {
  const mode = def.rotation ?? 2
  const turn =
    mode === 0 ? IDENTITY : mode === 1 ? start.rotation : (tag?.rotation ?? start.rotation)
  const origin = (def.position ?? 1) === 2 && tag ? tag.position : start.position
  const position: Vec3 = look.offset
    ? (origin.map((v, k) => v + rotate(look.offset!, turn)[k]!) as Vec3)
    : [origin[0], origin[1], origin[2]]
  return {
    position,
    rotation: look.angle ? quatMultiply(turn, quatFromEuler(look.angle)) : turn,
  }
}
