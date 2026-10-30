import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import {
  Suspense,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type Ref,
} from 'react'
import {
  AnimationClip,
  AnimationMixer,
  Box3,
  Color,
  LoopOnce,
  LoopRepeat,
  Skeleton,
  Vector3,
  type AnimationAction,
  type Bone,
  type Group,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type SkinnedMesh,
} from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { bodyPart, coveredParts, type GearLook } from '../game/assets/gear.ts'
import { ModelBoundary } from './ModelBoundary.tsx'
import {
  getModel,
  modelUrl,
  type LogicalAnimation,
  type ModelEntry,
} from '../game/assets/manifest.ts'
import { lcSkillAnims } from '../game/data/lcSource.ts'
import { TIMINGS } from '../game/logic/combat.ts'
import { useGameStore } from '../state/gameStore.ts'

export type BaseAnimation = 'idle' | 'run'

export interface CharacterHandle {
  /** Looping animation to return to after one-shots. */
  setBase(anim: BaseAnimation): void
  /** Swing timed so the blow lands exactly TIMINGS.impactDelay after this call. */
  attack(): void
  /**
   * The skill's own clips from the client (one clip, or a spell's wind-up then release), timed so
   * the blow lands `landsIn` game seconds from now; false when the model has none for it.
   */
  skill(skillId: number, landsIn: number): boolean
  /** Hit reaction: red flash, flinch, and the "hit" clip if the model has one. */
  hit(crit: boolean): void
  die(): void
  victory(): void
  /** Leave the death pose and return to the base animation. */
  revive(): void
  /** Model height in world units (after scaling). */
  height(): number
}

const FLASH_COLOR = new Color('#ff3b1f')
const FLASH_STRENGTH = 0.55

interface AnimState {
  base: BaseAnimation
  current: AnimationAction | null
  oneShot: boolean
  dead: boolean
  flash: number
  flinch: number
  height: number
  measured: number
  /** A clip waiting to start (a spell's release after its wind-up), in game seconds. */
  pending: { in: number; start(): void } | null
}

/** Share of a skill clip at which its blow lands (the client's timing is in the encrypted effects). */
const SKILL_IMPACT_AT = 0.45
/** Limits of the speed a skill clip is played at to fit the fight's timing. */
const SKILL_SPEED = { min: 0.5, max: 2.5 }
const clampSpeed = (speed: number) => Math.min(SKILL_SPEED.max, Math.max(SKILL_SPEED.min, speed))

function fadeTo(state: AnimState, action: AnimationAction, fade: number): void {
  if (state.current === action) return
  action.reset().setEffectiveWeight(1).fadeIn(fade).play()
  state.current?.fadeOut(fade)
  state.current = action
}

interface Props {
  modelId: string
  ref?: Ref<CharacterHandle>
  /** Extra scale on top of the manifest scale (e.g. LC t_npc.a_scale). */
  scale?: number
  /** Animation speed multiplier source; defaults to the dev time scale. */
  timeScale?: () => number
  /** Worn weapons and armor shown on a class body (see game/assets/gear.ts). */
  gear?: readonly GearLook[]
}

/** Share of a model's texture that shines on its own (see prepareModel). */
const SELF_LIGHT = 0.35

interface Tinted {
  material: MeshStandardMaterial
  emissive: Color
}

/** A material of our own for a model copy: tint, self light, and a slot in the hit flash list. */
function ownMaterial(m: Material, model: ModelEntry | null, materials: Tinted[]): Material {
  const copy = m.clone() as MeshStandardMaterial
  const tint = model?.tint[m.name]
  if (tint && copy.color) copy.color.set(tint)
  // LC lit its models with a strong ambient light; a share of the texture shining on its own
  // keeps darker monster textures readable under our physical lighting
  if (copy.map && copy.emissive) {
    copy.emissiveMap = copy.map
    copy.emissive.setScalar(SELF_LIGHT)
  }
  if (copy.emissive) materials.push({ material: copy, emissive: copy.emissive.clone() })
  return copy
}

function prepareMesh(mesh: Mesh, model: ModelEntry | null, materials: Tinted[]) {
  mesh.castShadow = true
  // Skinned meshes move away from their bind-pose bounds; avoid popping out of view.
  mesh.frustumCulled = false
  mesh.material = Array.isArray(mesh.material)
    ? mesh.material.map((m) => ownMaterial(m, model, materials))
    : ownMaterial(mesh.material, model, materials)
}

/** Class body meshes by part (`bu` → the shirt) and how many worn pieces cover each. */
interface BodyParts {
  meshes: { part: string; mesh: Mesh }[]
  covers: Map<Mesh, number>
  bones: Map<string, Bone>
}

function prepareModel(source: Object3D, model: ModelEntry) {
  const object = cloneSkinned(source)
  const materials: Tinted[] = []
  const body: BodyParts = { meshes: [], covers: new Map(), bones: new Map() }
  object.traverse((child) => {
    if ((child as Bone).isBone) body.bones.set(child.name, child as Bone)
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    prepareMesh(mesh, model, materials)
    const part = bodyPart(mesh.name)
    if (part) body.meshes.push({ part, mesh })
  })
  return { object, materials, body }
}

/**
 * Puts one worn piece on a class body: its meshes are skinned to the body's skeleton (bones of the
 * same names) and the body parts it replaces are hidden while it is worn.
 */
function WornPiece({
  object,
  body,
  materials,
  url,
  slot,
}: {
  object: Object3D
  body: BodyParts
  materials: Tinted[]
  url: string
  slot: GearLook['slot']
}) {
  const gltf = useGLTF(url)

  useLayoutEffect(() => {
    const meshes: SkinnedMesh[] = []
    cloneSkinned(gltf.scene).traverse((child) => {
      if ((child as SkinnedMesh).isSkinnedMesh) meshes.push(child as SkinnedMesh)
    })
    const own: Tinted[] = []
    for (const mesh of meshes) {
      const { bones, boneInverses } = mesh.skeleton
      const joints = bones.map((b) => body.bones.get(b.name) ?? b)
      mesh.bind(new Skeleton(joints, boneInverses), mesh.bindMatrix)
      prepareMesh(mesh, null, own)
      object.add(mesh)
    }
    materials.push(...own)
    const covered = coveredParts(
      slot,
      meshes.map((m) => m.name),
    )
    const hidden = body.meshes.filter((p) => covered.has(p.part)).map((p) => p.mesh)
    for (const mesh of hidden) {
      body.covers.set(mesh, (body.covers.get(mesh) ?? 0) + 1)
      mesh.visible = false
    }
    return () => {
      meshes.forEach((mesh) => mesh.removeFromParent())
      for (const mesh of hidden) {
        const left = (body.covers.get(mesh) ?? 1) - 1
        body.covers.set(mesh, left)
        if (left === 0) mesh.visible = true
      }
      for (const tinted of own) {
        const at = materials.indexOf(tinted)
        if (at >= 0) materials.splice(at, 1)
        tinted.material.dispose()
      }
    }
  }, [object, body, materials, gltf, slot])

  return null
}

export function Character({ modelId, ref, timeScale, gear, scale = 1 }: Props) {
  const model = getModel(modelId)
  const gltf = useGLTF(modelUrl(model))
  const { object, materials, body } = useMemo(
    () => prepareModel(gltf.scene, model),
    [gltf.scene, model],
  )
  const mixer = useMemo(() => new AnimationMixer(object), [object])

  const { actions, attacks, clipAction } = useMemo(() => {
    const find = (clipName: string, logical: string) => {
      const clip = AnimationClip.findByName(gltf.animations, clipName)
      if (!clip) console.warn(`[${model.id}] clip "${clipName}" not found for "${logical}"`)
      return clip ? mixer.clipAction(clip) : undefined
    }
    const map: Partial<Record<LogicalAnimation, AnimationAction>> = {}
    for (const [logical, clipName] of Object.entries(model.animations)) {
      const action = find(clipName, logical)
      if (action) map[logical as LogicalAnimation] = action
    }
    const attackActions = model.attacks
      .map((name) => find(name, 'attack'))
      .filter((a): a is AnimationAction => Boolean(a))
    // skill clips: the client's names differ in letter case now and then
    const byName = new Map(gltf.animations.map((clip) => [clip.name.toLowerCase(), clip]))
    const clipAction = (name: string | undefined) => {
      const clip = name ? byName.get(name.toLowerCase()) : undefined
      return clip ? mixer.clipAction(clip) : undefined
    }
    return { actions: map, attacks: attackActions, clipAction }
  }, [gltf.animations, mixer, model])

  const flinchRef = useRef<Group>(null)
  const anim = useRef<AnimState>({
    base: 'idle',
    current: null,
    oneShot: false,
    dead: false,
    flash: 0,
    flinch: 0,
    height: 1.8,
    measured: 0,
    pending: null,
  })
  const swing = useRef(0)

  useEffect(() => {
    const state = anim.current
    const onFinished = (e: { action: AnimationAction }) => {
      if (state.dead || !state.oneShot || e.action !== state.current) return
      state.oneShot = false
      const base = actions[state.base]
      if (base) fadeTo(state, base, 0.2)
    }
    mixer.addEventListener('finished', onFinished)

    const idle = actions.idle
    if (idle && !state.current) {
      idle.setLoop(LoopRepeat, Infinity)
      fadeTo(state, idle, 0)
    }

    return () => {
      mixer.removeEventListener('finished', onFinished)
      mixer.stopAllAction()
      state.current = null
    }
  }, [actions, mixer])

  useEffect(() => () => materials.forEach((m) => m.material.dispose()), [materials])

  useImperativeHandle(ref, () => {
    const state = anim.current
    const playOnce = (action: AnimationAction, speed: number, fade: number) => {
      action.setLoop(LoopOnce, 1)
      action.clampWhenFinished = false
      action.timeScale = speed
      state.oneShot = true
      if (state.current === action) action.reset().play()
      else fadeTo(state, action, fade)
    }
    /** Loops a clip until the next one-shot takes over (a spell held before its release). */
    const hold = (action: AnimationAction) => {
      action.setLoop(LoopRepeat, Infinity)
      action.timeScale = 1
      state.oneShot = true
      fadeTo(state, action, 0.1)
    }
    const playBase = (fade: number) => {
      const action = actions[state.base]
      if (!action) return
      action.setLoop(LoopRepeat, Infinity)
      action.timeScale = 1
      fadeTo(state, action, fade)
    }

    return {
      setBase(name) {
        state.base = name
        if (!state.oneShot && !state.dead) playBase(0.2)
      },
      attack() {
        const action = attacks[swing.current++ % Math.max(1, attacks.length)]
        if (state.dead || !action) return
        playOnce(action, model.attackImpact / TIMINGS.impactDelay, 0.08)
      },
      skill(skillId, landsIn) {
        const anim = lcSkillAnims?.[skillId]
        const fire = clipAction(anim?.fire)
        if (!anim || !fire || state.dead) return false
        const ready = clipAction(anim.ready)
        const release = (inSeconds: number) =>
          playOnce(fire, clampSpeed((fire.getClip().duration * SKILL_IMPACT_AT) / inSeconds), 0.08)
        const windUp = landsIn - TIMINGS.impactDelay
        const still = clipAction(anim.still)
        const releaseAfter = (inSeconds: number) => ({
          in: inSeconds,
          start: () => release(TIMINGS.impactDelay),
        })
        if (ready && still && windUp > ready.getClip().duration * 1.2) {
          // a long spell: the wind-up at its own pace, then the caster holds it until the release
          const readyTime = ready.getClip().duration * 0.9
          playOnce(ready, 1, 0.1)
          state.pending = {
            in: readyTime,
            start: () => {
              hold(still)
              state.pending = releaseAfter(windUp - readyTime)
            },
          }
        } else if (ready && windUp > 0.15) {
          // a spell: wind-up for the cast time, then the release lands the blow
          playOnce(ready, clampSpeed(ready.getClip().duration / windUp), 0.1)
          state.pending = releaseAfter(windUp)
        } else {
          state.pending = null
          release(Math.max(0.1, landsIn))
        }
        return true
      },
      hit(crit) {
        if (state.dead) return
        state.flash = 1
        state.flinch = crit ? 1.6 : 1
        const action = actions.hit
        if (action && !state.oneShot) playOnce(action, 1, 0.05)
      },
      die() {
        const action = actions.die
        state.dead = true
        state.pending = null
        state.oneShot = false
        state.flinch = 0
        if (!action) return
        action.setLoop(LoopOnce, 1)
        action.clampWhenFinished = true
        action.timeScale = 1
        fadeTo(state, action, 0.1)
      },
      victory() {
        const action = actions.victory
        if (state.dead || !action) return
        playOnce(action, 1, 0.25)
      },
      revive() {
        state.dead = false
        state.oneShot = false
        playBase(0.3)
      },
      height: () => state.height,
    }
  }, [actions, attacks, clipAction, model])

  useFrame((_, delta) => {
    const state = anim.current
    const scale = timeScale ? timeScale() : useGameStore.getState().timeScale
    const dt = Math.min(delta, 0.1) * scale
    mixer.update(dt)
    if (state.pending) {
      state.pending.in -= dt
      if (state.pending.in <= 0) {
        const { start } = state.pending
        state.pending = null
        if (!state.dead) start()
      }
    }

    // Measure once the skeleton has been posed by a render (bind-pose bounds are unreliable).
    const holder = flinchRef.current
    if (holder && state.measured < 3 && ++state.measured === 3) {
      const box = new Box3().setFromObject(object, true)
      const origin = holder.getWorldPosition(new Vector3())
      const parentScale = holder.getWorldScale(new Vector3()).y
      const h = (box.max.y - origin.y) / parentScale
      if (Number.isFinite(h) && h > 0) state.height = h
    }

    if (state.flash > 0) {
      state.flash = Math.max(0, state.flash - dt * 9)
      for (const { material, emissive } of materials) {
        material.emissive.copy(emissive).lerp(FLASH_COLOR, state.flash * FLASH_STRENGTH)
      }
    }
    const flinch = flinchRef.current
    if (flinch) {
      state.flinch = Math.max(0, state.flinch - dt * 6)
      flinch.rotation.x = -0.22 * state.flinch
      flinch.position.z = -0.08 * state.flinch
    }
  })

  return (
    <group ref={flinchRef}>
      <primitive object={object} scale={model.scale * scale} />
      {gear?.map(({ url, slot }) => (
        // each piece loads on its own: the body and the other pieces stay on screen meanwhile,
        // and a piece that fails to load shows nothing
        <ModelBoundary key={`${slot}:${url}`} resetKey={url} fallback={null}>
          <Suspense fallback={null}>
            <WornPiece object={object} body={body} materials={materials} url={url} slot={slot} />
          </Suspense>
        </ModelBoundary>
      ))}
    </group>
  )
}
