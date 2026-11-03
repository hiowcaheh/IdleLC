import {
  AddEquation,
  CustomBlending,
  OneFactor,
  SrcAlphaFactor,
  Vector3,
  type Bone,
  type Material,
  type Mesh,
  type Object3D,
  type SkinnedMesh,
} from 'three'
import type { ClassId } from '../game/data/types.ts'
import type { Equipment } from '../game/logic/equipment.ts'

/** CItemEffect::Change, ItemEffect.cpp:318-330,386-405. Helmet/shield do not count. */
export const UPGRADE_STEPS = [4, 6, 8, 10, 12, 15] as const
export type UpgradeStep = (typeof UPGRADE_STEPS)[number]

export function upgradeStep(plus: number): UpgradeStep | null {
  let step: UpgradeStep | null = null
  for (const value of UPGRADE_STEPS) if (plus >= value) step = value
  return step
}

export function armorUpgradePlus(equipment: Equipment): number {
  return Math.min(
    ...(['armor', 'pants', 'gloves', 'boots'] as const).map((slot) => equipment[slot]?.plus ?? 0),
  )
}

const PREFIX: Record<ClassId, string> = {
  titan: 'ia_t',
  knight: 'ia_k',
  healer: 'i_hw',
  mage: 'i_ma',
  rogue: 'ih_ro',
  sorcerer: 'so',
}

/** CItemEffect::GetSubTypeWeapon; this is the client's effect variant, not handedness. */
export function upgradeGroup(
  classId: ClassId,
  kind: 'weapon' | 'armor',
  plus: number,
  weaponSubtype = -1,
): string | null {
  const step = upgradeStep(plus)
  if (step === null) return null
  const variant = [1, 2, 4, 11, 12, 13].includes(weaponSubtype) ? 'wp2' : 'wp'
  return `${PREFIX[classId]}_${kind === 'armor' ? 'am' : variant}_${UPGRADE_STEPS.indexOf(step) + 1}`
}

/**
 * Explicit non-premultiplied additive state. Separate alpha factors keep a transparent canvas
 * compositable by the browser; RGB uses the alpha encoded by normalizeAdditiveRgba.
 * Three r186 Sprite and MeshBasic both sample sRGB maps and encode output before blending.
 */
export function additiveEffectMaterial<T extends Material>(material: T): T {
  material.transparent = true
  material.blending = CustomBlending
  material.blendEquation = AddEquation
  material.blendSrc = SrcAlphaFactor
  material.blendDst = OneFactor
  material.blendEquationAlpha = AddEquation
  material.blendSrcAlpha = OneFactor
  material.blendDstAlpha = OneFactor
  material.premultipliedAlpha = false
  material.depthWrite = false
  material.toneMapped = false
  return material
}

/** Live meshes/bones of one character; effects share its animated skeleton. */
export interface UpgradeTarget {
  object: Object3D
  bones: Map<string, Bone>
  weapons: Set<Mesh>
}

export interface VectorSample {
  time: number
  value: number[]
}

/** The upgrade subset uses CSampleSpline<FLOAT3D, CCubicSplineInterpolate<FLOAT3D>>. */
export function upgradePath(
  samples: readonly VectorSample[],
): (time: number, out: Vector3) => Vector3 {
  const points = samples.map((sample) => new Vector3().fromArray(sample.value))
  const derivatives = points.map(() => new Vector3())
  const n = points.length - 1
  if (n > 1) {
    const gamma = Array<number>(points.length)
    const delta = points.map(() => new Vector3())
    gamma[0] = 0.5
    for (let i = 1; i < n; i++) gamma[i] = 1 / (4 - gamma[i - 1]!)
    gamma[n] = 1 / (2 - gamma[n - 1]!)
    delta[0]!.subVectors(points[1]!, points[0]!).multiplyScalar(3 * gamma[0]!)
    for (let i = 1; i < n; i++) {
      delta[i]!.subVectors(points[i + 1]!, points[i - 1]!)
        .multiplyScalar(3)
        .sub(delta[i - 1]!)
        .multiplyScalar(gamma[i]!)
    }
    delta[n]!.subVectors(points[n]!, points[n - 1]!)
      .multiplyScalar(3)
      .sub(delta[n - 1]!)
      .multiplyScalar(gamma[n]!)
    derivatives[n]!.copy(delta[n]!)
    // Preserve the FLOAT3D specialization's gamma[i], rather than the generic template's i-1.
    for (let i = n; i > 0; i--)
      derivatives[i - 1]!.copy(delta[i - 1]!).addScaledVector(derivatives[i]!, -gamma[i]!)
  }
  return (time, out) => {
    if (n < 0) return out.set(0, 0, 0)
    if (time <= samples[0]!.time) return out.copy(points[0]!)
    if (time >= samples[n]!.time) return out.copy(points[n]!)
    let next = 1
    while (samples[next]!.time < time) next++
    const prev = next - 1
    const t = (time - samples[prev]!.time) / (samples[next]!.time - samples[prev]!.time)
    const t2 = t * t
    const t3 = t2 * t
    return out
      .copy(points[prev]!)
      .multiplyScalar(1 - 3 * t2 + 2 * t3)
      .addScaledVector(points[next]!, 3 * t2 - 2 * t3)
      .addScaledVector(derivatives[prev]!, t - 2 * t2 + t3)
      .addScaledVector(derivatives[next]!, -t2 + t3)
  }
}

export interface WeaponAnchor {
  mesh: Mesh
  vertex: number
}

/** Select actual weapon vertices along its longest axis instead of circling the character. */
export function weaponAnchors(mesh: Mesh, count: number): WeaponAnchor[] {
  const positions = mesh.geometry.getAttribute('position')
  if (!positions || positions.count === 0) return []
  mesh.geometry.computeBoundingBox()
  const bounds = mesh.geometry.boundingBox!
  const size = bounds.getSize(new Vector3())
  const axis = size.x > size.y && size.x > size.z ? 0 : size.y > size.z ? 1 : 2
  const coordinate = (index: number) =>
    [positions.getX(index), positions.getY(index), positions.getZ(index)][axis]!
  const start = bounds.min.getComponent(axis)
  const extent = size.getComponent(axis)
  return Array.from({ length: count }, (_, n) => {
    const at = start + extent * ((n + 0.5) / count)
    let vertex = 0
    let nearest = Infinity
    for (let i = 0; i < positions.count; i++) {
      const distance = Math.abs(coordinate(i) - at)
      if (distance < nearest) {
        nearest = distance
        vertex = i
      }
    }
    return { mesh, vertex }
  })
}

/** Posed vertex in the effect holder's local space, including parent scale and animation. */
export function weaponAnchorPosition(
  anchor: WeaponAnchor,
  holder: Object3D,
  out: Vector3,
): Vector3 {
  out.fromBufferAttribute(anchor.mesh.geometry.getAttribute('position'), anchor.vertex)
  const skinned = anchor.mesh as SkinnedMesh
  if (skinned.isSkinnedMesh) skinned.applyBoneTransform(anchor.vertex, out)
  anchor.mesh.localToWorld(out)
  return holder.worldToLocal(out)
}
