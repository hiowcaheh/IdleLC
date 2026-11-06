import { Euler, Quaternion, Vector3, type Object3D } from 'three'
import definitions from '../game/data/generated/lc-artifact-effects.json'
import type { ActiveEffect } from '../game/logic/combat.ts'
import { titleSample } from './titleEffects.ts'
import { placeSourceTag, type UpgradeTarget, type VectorSample } from './upgradeEffects.ts'

export type ArtifactVisual = 'Angel_wing03'

interface WingEffect {
  model: string
  color: number
  stretch: number[]
  control: {
    alpha: { time: number; value: number }[]
    position: VectorSample[]
    angle: VectorSample[]
    stretch: VectorSample[]
  }
}
export interface ArtifactWing {
  name: string
  delay: number
  tag: string
  effect: WingEffect
  asset: { url: string; sha256: string }
}
const data = definitions as unknown as {
  wings: Omit<ArtifactWing, 'effect' | 'asset'>[]
  effects: Record<string, WingEffect>
  models: Record<string, ArtifactWing['asset']>
}
export const ARTIFACT_WINGS: readonly ArtifactWing[] = data.wings.map((wing) => {
  const effect = data.effects[wing.name]!
  return { ...wing, effect, asset: data.models[effect.model]! }
})

/** A chosen blessing alone is insufficient: its actual effect must still be alive. */
export function activeArtifactVisual(
  effects: readonly Pick<ActiveEffect, 'visual' | 'remaining' | 'dungeon'>[],
): ArtifactVisual | undefined {
  return effects.find((e) => e.dungeon && e.remaining > 0 && e.visual === 'Angel_wing03')?.visual
}

const offset = new Vector3(),
  angle = new Euler(0, 0, 0, 'YXZ'),
  rotation = new Quaternion()
const radians = Math.PI / 180

/** CSkaEffect: live CENTER tag, then its local control position and heading/pitch/bank. */
export function placeArtifactWing(
  target: UpgradeTarget,
  holder: Object3D,
  out: Object3D,
  wing: ArtifactWing,
  elapsed: number,
): boolean {
  if (elapsed < wing.delay || !placeSourceTag(target, wing.tag, holder, out)) return false
  const age = elapsed - wing.delay
  const control = wing.effect.control
  offset.fromArray(titleSample(control.position, age, [0, 0, 0]))
  out.position.add(offset.applyQuaternion(out.quaternion))
  const [heading = 0, pitch = 0, bank = 0] = titleSample(control.angle, age, [0, 0, 0])
  angle.set(pitch * radians, heading * radians, bank * radians, 'YXZ')
  out.quaternion.multiply(rotation.setFromEuler(angle)).normalize()
  out.scale.fromArray(titleSample(control.stretch, age, wing.effect.stretch))
  return true
}

export function artifactWingOpacity(wing: ArtifactWing, elapsed: number): number {
  return titleSample(wing.effect.control.alpha, elapsed - wing.delay, wing.effect.color & 255) / 255
}
