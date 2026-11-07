/**
 * COrbitEffect::Process (Engine/Effect/COrbitEffect.cpp): where an orbit effect's points are. Each
 * orbit puts its effect at radius · sin(phaseMul · t + 2π · phaseOffset) + offset on each axis,
 * turned with the effect and moved to its tag, or along the way to a goal tag after the fade-in.
 * Fading in and out can grow the radii and phases and the offset (the fade flags).
 */
import type { EffectDef } from './data.ts'
import { rotate, slerp, type Placement, type Quat, type Vec3 } from './particles.ts'

/** The orbit's tag frame, kept between steps (m_vTagPos, m_qTagRot, m_bFirstProcess). */
export interface OrbitFrame {
  position: Vec3
  rotation: Quat
  first: boolean
}

const FADEIN = { radius: [0, 2, 4], phase: [1, 3, 5], offset: 6 } as const
const FADEOUT = { radius: [16, 18, 20], phase: [17, 19, 21], offset: 22 } as const

export function orbitPoints(
  def: EffectDef,
  age: number,
  left: number,
  attach: Placement,
  goal: Placement | null,
  frame: OrbitFrame,
): Vec3[] {
  const flags = def.fadeFlags ?? 0
  const radius: Vec3 = [1, 1, 1]
  const phase: Vec3 = [1, 1, 1]
  let offset = 1
  const apply = (bits: typeof FADEIN | typeof FADEOUT, r: number, p: number, value: number) => {
    for (let axis = 0; axis < 3; axis++) {
      if (flags & (1 << bits.radius[axis]!)) radius[axis] = r
      if (flags & (1 << bits.phase[axis]!)) phase[axis] = p
    }
    if (flags & (1 << bits.offset)) offset = value
  }
  if (age <= def.fadeIn && def.fadeIn > 0) {
    const fade = age / def.fadeIn
    apply(
      FADEIN,
      ((def.fadeInRadiusMul ?? 1) - 1) * (fade - 1) * (fade - 1) + 1,
      (1 - (def.fadeInPhaseMul ?? 1)) * (fade - 1) + 1,
      fade,
    )
  } else if (left <= def.fadeOut && def.fadeOut > 0) {
    const fade = Math.max(0.01, (left - def.fadeOut * 0.5) / (def.fadeOut * 0.5))
    apply(
      FADEOUT,
      ((def.fadeOutRadiusMul ?? 1) - 1) * (fade - 1) * (fade - 1) + 1,
      (1 - (def.fadeOutPhaseMul ?? 1)) * (fade - 1) + 1,
      fade,
    )
  }
  const span = def.lifeTime - def.fadeIn - def.fadeOut * 0.5
  const ratio = Math.min(1, span > 0 ? (age - def.fadeIn) / span : 1)
  const toGoal = !!goal && age > def.fadeIn
  if ((def.position ?? 2) === 2 || frame.first)
    frame.position = toGoal
      ? (attach.position.map((v, i) => v + (goal!.position[i]! - v) * ratio) as Vec3)
      : attach.position
  const mode = def.rotation ?? 1
  if (mode === 2 || (frame.first && mode === 1))
    frame.rotation = toGoal ? slerp(ratio, attach.rotation, goal!.rotation) : attach.rotation
  frame.first = false
  return (def.orbits ?? []).map((orbit) => {
    const local = [0, 1, 2].map(
      (axis) =>
        radius[axis]! *
          orbit.radius[axis]! *
          Math.sin(
            orbit.phaseMul[axis]! * phase[axis]! * age + 2 * Math.PI * orbit.phaseOffset[axis]!,
          ) +
        orbit.offset[axis]! * offset,
    ) as Vec3
    const turned = rotate(local, frame.rotation)
    return turned.map((v, i) => v + frame.position[i]!) as Vec3
  })
}
