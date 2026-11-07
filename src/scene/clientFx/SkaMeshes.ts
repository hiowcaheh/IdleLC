/**
 * Draws running SKA model effects (EFSK) the way CSkaEffect does: the .smc model (as GLB, see
 * scripts/lc/client-effects.mjs) at the effect's placement, stretched, its first animation
 * looping (FindFirstAnimationID, AN_LOOPING), every surface tinted by the model colour
 * (SetModelColor). Add shaders blend as src·alpha + dst, the others as alpha blending once the
 * colour's alpha is below 255 (the same rules as the artifact wings).
 */
import {
  AnimationMixer,
  Color,
  NormalBlending,
  SRGBColorSpace,
  type AnimationClip,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
  type SkinnedMesh,
} from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { additiveEffectMaterial } from '../upgradeEffects.ts'
import type { LiveSka } from './player.ts'

const loader = new GLTFLoader()
const loads = new Map<string, Promise<GLTF | null>>()

/** Each model once, by its URL; a model that fails to load draws nothing. */
function loadSka(url: string): Promise<GLTF | null> {
  let load = loads.get(url)
  if (!load) {
    load = loader.loadAsync(`${import.meta.env.BASE_URL}${url}`).catch(() => null)
    loads.set(url, load)
  }
  return load
}

interface Tinted {
  material: MeshBasicMaterial
  color: Color
  opacity: number
  additive: boolean
}

const tint = new Color()

/** One running SKA effect: its own copy of the model, shown once it has loaded. */
export class SkaEffectMesh {
  readonly live: LiveSka
  readonly object: Group
  private model: Object3D | null = null
  private mixer: AnimationMixer | null = null
  private tinted: Tinted[] = []
  private disposed = false

  constructor(live: LiveSka, holder: Group) {
    this.live = live
    this.object = holder
    void loadSka(live.url).then((gltf) => {
      if (!gltf || this.disposed) return
      this.attach(gltf.scene, gltf.animations)
    })
  }

  private attach(scene: Object3D, animations: AnimationClip[]) {
    const model = cloneSkinned(scene)
    model.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      mesh.frustumCulled = false
      mesh.renderOrder = 11
      const prepare = (source: MeshBasicMaterial) => {
        const material = source.clone()
        const additive = material.userData.lcBlend === 'additive'
        if (additive) additiveEffectMaterial(material)
        else {
          material.blending = NormalBlending
          material.premultipliedAlpha = false
          material.toneMapped = false
        }
        if (material.map) material.map.premultiplyAlpha = false
        this.tinted.push({
          material,
          color: material.color.clone(),
          opacity: material.opacity,
          additive,
        })
        return material
      }
      mesh.material = Array.isArray(mesh.material)
        ? (mesh.material as MeshBasicMaterial[]).map(prepare)
        : prepare(mesh.material as MeshBasicMaterial)
    })
    this.object.add(model)
    this.model = model
    const clip = animations[0]
    if (clip) {
      this.mixer = new AnimationMixer(model)
      this.mixer.clipAction(clip).play()
    }
  }

  /** Copies the effect's colour, stretch and placement; the animation follows its age. */
  update(): void {
    const live = this.live
    const [x, y, z] = live.position
    this.object.position.set(x, y, z)
    const [w, qx, qy, qz] = live.rotation
    this.object.quaternion.set(qx, qy, qz, w)
    this.object.scale.set(live.stretch[0], live.stretch[1], live.stretch[2])
    if (!this.model) return
    this.mixer?.setTime(live.age)
    const alpha = (live.color & 255) / 255
    tint.setRGB(
      (live.color >>> 24) / 255,
      ((live.color >>> 16) & 255) / 255,
      ((live.color >>> 8) & 255) / 255,
      SRGBColorSpace,
    )
    for (const t of this.tinted) {
      t.material.color.copy(t.color).multiply(tint)
      t.material.opacity = t.opacity * alpha
      if (!t.additive) {
        // DefaultShader blends once the model's alpha drops below 255
        const fading = alpha < 1
        t.material.transparent = fading || t.material.transparent
        t.material.depthWrite = !fading
        if (fading) t.material.alphaTest = 0
      }
    }
  }

  dispose(): void {
    this.disposed = true
    this.mixer?.stopAllAction()
    this.model?.traverse((child) => {
      const mesh = child as SkinnedMesh
      if (mesh.isSkinnedMesh) mesh.skeleton.dispose()
    })
    for (const t of this.tinted) t.material.dispose()
    this.object.removeFromParent()
  }
}
