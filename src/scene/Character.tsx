import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react'
import {
  AnimationClip,
  AnimationMixer,
  Box3,
  Color,
  LoopOnce,
  LoopRepeat,
  Vector3,
  type AnimationAction,
  type Group,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import {
  getModel,
  modelUrl,
  type LogicalAnimation,
  type ModelEntry,
} from '../game/assets/manifest.ts'
import { TIMINGS } from '../game/logic/combat.ts'
import { useGameStore } from '../state/gameStore.ts'

export type BaseAnimation = 'idle' | 'run'

export interface CharacterHandle {
  /** Looping animation to return to after one-shots. */
  setBase(anim: BaseAnimation): void
  /** Swing timed so the blow lands exactly TIMINGS.impactDelay after this call. */
  attack(): void
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
}

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
}

/** Share of a model's texture that shines on its own (see prepareModel). */
const SELF_LIGHT = 0.35

function prepareModel(source: Object3D, model: ModelEntry) {
  const object = cloneSkinned(source)
  const materials: { material: MeshStandardMaterial; emissive: Color }[] = []
  const cloneMaterial = (m: Material) => {
    const copy = m.clone() as MeshStandardMaterial
    const tint = model.tint[m.name]
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
  object.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    // Skinned meshes move away from their bind-pose bounds; avoid popping out of view.
    mesh.frustumCulled = false
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(cloneMaterial)
      : cloneMaterial(mesh.material)
  })
  return { object, materials }
}

export function Character({ modelId, ref, timeScale, scale = 1 }: Props) {
  const model = getModel(modelId)
  const gltf = useGLTF(modelUrl(model))
  const { object, materials } = useMemo(() => prepareModel(gltf.scene, model), [gltf.scene, model])
  const mixer = useMemo(() => new AnimationMixer(object), [object])

  const { actions, attacks } = useMemo(() => {
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
    return { actions: map, attacks: attackActions }
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
  }, [actions, attacks, model])

  useFrame((_, delta) => {
    const state = anim.current
    const scale = timeScale ? timeScale() : useGameStore.getState().timeScale
    const dt = Math.min(delta, 0.1) * scale
    mixer.update(dt)

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
    </group>
  )
}
