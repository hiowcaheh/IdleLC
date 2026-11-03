import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AnimationMixer,
  Color,
  NormalBlending,
  Quaternion,
  SRGBColorSpace,
  SpriteMaterial,
  Vector3,
  type Group,
  type Material,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
  type Sprite,
  type Texture,
} from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import definitions from '../game/data/generated/lc-upgrade-effects.json'
import type { ClassId } from '../game/data/types.ts'
import {
  additiveEffectMaterial,
  upgradeGroup,
  upgradePath,
  upgradeStep,
  weaponAnchorPosition,
  weaponAnchors,
  type UpgradeTarget,
  type VectorSample,
  type WeaponAnchor,
} from './upgradeEffects.ts'

interface Control {
  alpha: { time: number; value: number }[]
  stretch: VectorSample[]
  position: VectorSample[]
  angle: VectorSample[]
}
interface Definition {
  name: string
  kind: string
  lifeTime: number
  repeat: number
  color?: number
  stretch?: number[]
  model?: string
  control?: Control | null
  offset?: number[]
  paths?: { samples: VectorSample[]; effect: string }[]
}
interface EffectGroup {
  effects: { time: number; name: string }[]
  tags: { time: number; effect: number; name: string }[]
}
interface EffectData {
  groups: Record<string, EffectGroup>
  effects: Record<string, Definition>
  assets: {
    models: Record<string, { url: string; sha256: string }>
    textures: Record<string, { url: string; sha256: string }>
  }
}
const data = definitions as unknown as EffectData
const fxUrl = (asset: { url: string; sha256: string }) =>
  `${import.meta.env.BASE_URL}${asset.url}?v=${asset.sha256.slice(0, 12)}`
const modelFiles = new Map(
  Object.entries(data.assets.models).map(([key, value]) => [key.toLowerCase(), value]),
)

export interface UpgradeLook {
  classId: ClassId
  weaponPlus: number
  armorPlus: number
  weaponSubtype?: number
}

interface Entry {
  effect: Definition
  tag: string
  delay: number
  path?: (time: number, out: Vector3) => Vector3
  pathLife?: number
}

/** Source groups, source tags, and source spline paths; particle emission remains an adapter. */
function entries(groupName: string | null): Entry[] {
  const group = groupName ? data.groups[groupName] : undefined
  if (!group) return []
  return group.effects.flatMap((key, index) => {
    const effect = data.effects[key.name]
    if (!effect) return []
    const tag = group.tags.find((key) => key.effect === index)?.name ?? '__ROOT'
    if (effect.kind !== 'EFSP') return [{ effect, tag, delay: key.time }]
    return (effect.paths ?? []).flatMap((path) => {
      const child = data.effects[path.effect]
      if (!child) return []
      const sample = upgradePath(path.samples)
      const offset = new Vector3().fromArray(effect.offset ?? [0, 0, 0])
      return [
        {
          effect: child,
          tag,
          delay: key.time,
          pathLife: effect.lifeTime,
          path: (time: number, out: Vector3) => sample(time, out).add(offset),
        },
      ]
    })
  })
}

/** Signed C++ COLOR is stored as RGBA bytes, not Three's RGB hex. */
function effectColor(value = 0xffffffff) {
  return {
    color: new Color().setRGB(
      (value >>> 24) / 255,
      ((value >>> 16) & 255) / 255,
      ((value >>> 8) & 255) / 255,
      SRGBColorSpace,
    ),
    alpha: (value & 255) / 255,
  }
}
function localTime(time: number, life: number) {
  return life > 0 ? time % life : time
}
function scalarSample(samples: { time: number; value: number }[], time: number, fallback: number) {
  if (!samples.length) return fallback
  if (time <= samples[0]!.time) return samples[0]!.value
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!
    const b = samples[i]!
    if (time <= b.time) return a.value + (b.value - a.value) * ((time - a.time) / (b.time - a.time))
  }
  return samples[samples.length - 1]!.value
}

function controlTime(samples: { time: number }[], elapsed: number): number {
  const period = samples.length > 1 ? samples[samples.length - 1]!.time - samples[0]!.time : 0
  return period > 0 ? elapsed % period : elapsed
}

/** Position/orientation in the enclosing character's local space, after the skeleton moves. */
function placeTag(target: UpgradeTarget, tag: string, holder: Group, out: Group) {
  const hand = tag === 'LHAND' ? 'Bip01 L Hand' : tag === 'RHAND' ? 'Bip01 R Hand' : null
  const bone = hand ? target.bones.get(hand) : undefined
  const source = bone ?? target.object
  source.getWorldPosition(out.position)
  holder.worldToLocal(out.position)
  if (bone) {
    source.getWorldQuaternion(out.quaternion)
    out.quaternion.premultiply(holder.getWorldQuaternion(new Quaternion()).invert())
  } else out.quaternion.identity()
}

export function UpgradeAura({
  target,
  classId,
  weaponPlus,
  armorPlus,
  weaponSubtype = -1,
}: UpgradeLook & { target: UpgradeTarget }) {
  const weapon = upgradeGroup(classId, 'weapon', weaponPlus, weaponSubtype)
  const armor = upgradeGroup(classId, 'armor', armorPlus)
  const selected = useMemo(() => [...entries(weapon), ...entries(armor)], [weapon, armor])
  const step = upgradeStep(weaponPlus)
  return (
    <group name="upgrade-effects">
      {step && (
        <WeaponGlow key={`${classId}:${weapon}`} target={target} classId={classId} step={step} />
      )}
      {selected
        .filter((entry) => entry.effect.kind === 'EFSK' || entry.effect.kind === 'EFMD')
        .map((entry, index) => (
          <AttachedEffect key={`${weapon}:${armor}:${index}`} entry={entry} target={target} />
        ))}
    </group>
  )
}

function AttachedEffect({ entry, target }: { entry: Entry; target: UpgradeTarget }) {
  const holder = useRef<Group>(null)
  const anchor = useRef<Group>(null)
  const clock = useRef(0)
  const offset = useMemo(() => new Vector3(), [])
  const { effect } = entry
  const asset = effect.model ? modelFiles.get(effect.model.toLowerCase()) : undefined
  useFrame((_, delta) => {
    clock.current += Math.min(delta, 0.1)
    if (!holder.current || !anchor.current) return
    const elapsed = clock.current - entry.delay
    anchor.current.visible = elapsed >= 0
    if (elapsed < 0) return
    target.object.updateWorldMatrix(true, true)
    holder.current.updateWorldMatrix(true, false)
    placeTag(target, entry.tag, holder.current, anchor.current)
    if (entry.path)
      anchor.current.position.add(
        entry.path(localTime(elapsed, entry.pathLife ?? effect.lifeTime), offset),
      )
  })
  return (
    <group ref={holder}>
      <group ref={anchor}>
        {effect.kind === 'EFSK' && asset ? (
          <EffectModel effect={effect} url={fxUrl(asset)} />
        ) : (
          <EffectPlane effect={effect} />
        )}
      </group>
    </group>
  )
}

/** The recovered animated tinkerbell/ring models retain independent Add/Translucent materials. */
function EffectModel({ effect, url }: { effect: Definition; url: string }) {
  const gltf = useGLTF(url)
  const { object, materials } = useMemo(() => {
    const object = cloneSkinned(gltf.scene)
    const materials: Material[] = []
    const { color, alpha } = effectColor(effect.color)
    object.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      mesh.frustumCulled = false
      mesh.renderOrder = 5
      const prepare = (source: Material) => {
        const material = source.clone() as MeshBasicMaterial
        if (material.userData.lcBlend === 'additive') additiveEffectMaterial(material)
        else {
          material.blending = NormalBlending
          material.premultipliedAlpha = false
          material.depthWrite = false
          material.toneMapped = false
        }
        material.color?.multiply(color)
        material.opacity *= alpha
        if (material.map) material.map.premultiplyAlpha = false
        materials.push(material)
        return material
      }
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(prepare)
        : prepare(mesh.material)
    })
    return { object, materials }
  }, [gltf.scene, effect.color])
  const mixer = useMemo(() => new AnimationMixer(object), [object])
  const clock = useRef(0)
  const liveModel = useRef<Object3D>(null)
  useEffect(() => {
    for (const clip of gltf.animations) mixer.clipAction(clip).play()
    return () => {
      mixer.stopAllAction()
      mixer.uncacheRoot(object)
    }
  }, [gltf.animations, mixer, object])
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials])
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    clock.current += dt
    mixer.update(dt)
    if (effect.control?.alpha.length) {
      // CEffectControl replaces the color alpha and loops its own sample period.
      const opacity =
        scalarSample(effect.control.alpha, controlTime(effect.control.alpha, clock.current), 255) /
        255
      liveModel.current?.traverse((child) => {
        const mesh = child as Mesh
        if (!mesh.isMesh) return
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
          material.opacity = opacity
      })
    }
  })
  return (
    <primitive
      ref={liveModel}
      object={object}
      scale={(effect.stretch as [number, number, number]) ?? [1, 1, 1]}
    />
  )
}

/** PlaneAddFlat is represented by a billboard, rather than a full legacy MDL renderer. */
function EffectPlane({ effect }: { effect: Definition }) {
  const sprite = useRef<Sprite>(null)
  const texture = useTexture(fxUrl(data.assets.textures['plus-glow']!), prepareTexture)
  const { color, alpha } = useMemo(() => effectColor(effect.color), [effect.color])
  const material = useMemo(
    () => additiveEffectMaterial(new SpriteMaterial({ map: texture, color, opacity: alpha })),
    [texture, color, alpha],
  )
  const clock = useRef(0)
  useEffect(() => () => material.dispose(), [material])
  useFrame((_, delta) => {
    clock.current += Math.min(delta, 0.1)
    const material = sprite.current?.material
    if (!material) return
    if (effect.control?.alpha.length)
      material.opacity =
        scalarSample(effect.control.alpha, controlTime(effect.control.alpha, clock.current), 255) /
        255
    const angles = effect.control?.angle
    if (angles?.length) {
      const samples = angles.map((sample) => ({ time: sample.time, value: sample.value[2] ?? 0 }))
      material.rotation =
        (scalarSample(samples, localTime(clock.current, effect.lifeTime), 0) * Math.PI) / 180
    }
  })
  const size = effect.stretch?.[0] ?? 0.4
  return <sprite ref={sprite} material={material} scale={[size, size, 1]} renderOrder={5} />
}

function prepareTexture(texture: Texture | Texture[]) {
  for (const item of Array.isArray(texture) ? texture : [texture]) {
    item.colorSpace = SRGBColorSpace
    item.premultiplyAlpha = false
  }
}

const CLASS_COLOR: Record<ClassId, string> = {
  titan: '#ff7850',
  knight: '#91a4ff',
  healer: '#e4c6b3',
  mage: '#cf9aff',
  rogue: '#ffb88f',
  sorcerer: '#bdc9a7',
}

/** Bounded particle/trace adapter: positions come from animated weapon vertices, never a body orbit. */
function WeaponGlow({
  target,
  classId,
  step,
}: {
  target: UpgradeTarget
  classId: ClassId
  step: number
}) {
  const texture = useTexture(fxUrl(data.assets.textures['plus-particle']!), prepareTexture)
  const holder = useRef<Group>(null)
  const sprites = useRef<(Sprite | null)[]>([])
  const anchors = useRef<WeaponAnchor[]>([])
  const meshes = useRef<Mesh[]>([])
  const time = useRef(0)
  const count = step >= 10 ? 6 : step >= 6 ? 4 : 2
  const point = useMemo(() => new Vector3(), [])
  const material = useMemo(
    () =>
      additiveEffectMaterial(
        new SpriteMaterial({ map: texture, color: CLASS_COLOR[classId], opacity: 0.8 }),
      ),
    [texture, classId],
  )
  useEffect(() => () => material.dispose(), [material])
  useFrame((_, delta) => {
    if (!holder.current) return
    time.current += Math.min(delta, 0.1)
    const live = [...target.weapons]
    if (
      live.length !== meshes.current.length ||
      live.some((mesh, i) => mesh !== meshes.current[i])
    ) {
      meshes.current = live
      anchors.current = live
        .flatMap((mesh) => weaponAnchors(mesh, Math.ceil(count / Math.max(1, live.length))))
        .slice(0, count)
    }
    target.object.updateWorldMatrix(true, true)
    holder.current.updateWorldMatrix(true, false)
    for (let i = 0; i < count; i++) {
      const sprite = sprites.current[i]
      const anchor = anchors.current[i]
      if (!sprite) continue
      sprite.visible = Boolean(anchor)
      if (!anchor) continue
      weaponAnchorPosition(anchor, holder.current, point)
      sprite.position.copy(point)
      sprite.scale.setScalar(
        (step >= 12 ? 0.16 : 0.1) * (0.75 + 0.25 * Math.sin(time.current * 9 + i)),
      )
    }
  })
  return (
    <group ref={holder} name="weapon-glow">
      {Array.from({ length: count }, (_, i) => (
        <sprite
          key={i}
          ref={(sprite) => {
            sprites.current[i] = sprite
          }}
          material={material}
          renderOrder={5}
        />
      ))}
    </group>
  )
}
