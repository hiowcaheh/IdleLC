import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AnimationMixer,
  Color,
  NormalBlending,
  SRGBColorSpace,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type SkinnedMesh,
} from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import {
  ARTIFACT_WINGS,
  artifactWingOpacity,
  placeArtifactWing,
  type ArtifactWing,
} from './artifactEffects.ts'
import { additiveEffectMaterial, type UpgradeTarget } from './upgradeEffects.ts'

/** The two original animated SKA models and their six delayed/transparent source layers. */
export function ArtifactWings({ target, pace }: { target: UpgradeTarget; pace: () => number }) {
  return (
    <group name="artifact-wings">
      {ARTIFACT_WINGS.map((wing) => (
        <Wing key={wing.name} wing={wing} target={target} pace={pace} />
      ))}
    </group>
  )
}

function Wing({
  wing,
  target,
  pace,
}: {
  wing: ArtifactWing
  target: UpgradeTarget
  pace: () => number
}) {
  const { asset, effect } = wing
  const gltf = useGLTF(`${import.meta.env.BASE_URL}${asset.url}?v=${asset.sha256.slice(0, 12)}`)
  const { object, materials } = useMemo(() => {
    const object = cloneSkinned(gltf.scene)
    const materials: MeshBasicMaterial[] = []
    const opacity = artifactWingOpacity(wing, wing.delay)
    const color = new Color().setRGB(
      (effect.color >>> 24) / 255,
      ((effect.color >>> 16) & 255) / 255,
      ((effect.color >>> 8) & 255) / 255,
      SRGBColorSpace,
    )
    object.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      mesh.frustumCulled = false
      const prepare = (source: MeshBasicMaterial) => {
        const material = source.clone()
        if (material.userData.lcBlend === 'additive') additiveEffectMaterial(material)
        else {
          // DefaultShader switches from alpha test to alpha blending when model alpha < 255.
          // Keeping GLTF's MASK cutoff would discard the 50/255 and 20/255 ghost layers.
          if (opacity < 1) {
            material.transparent = true
            material.alphaTest = 0
            material.depthWrite = false
          }
          material.blending = NormalBlending
          material.premultipliedAlpha = false
          material.toneMapped = false
        }
        material.color.multiply(color)
        material.opacity *= opacity
        if (material.map) material.map.premultiplyAlpha = false
        materials.push(material)
        return material
      }
      mesh.material = Array.isArray(mesh.material)
        ? (mesh.material as MeshBasicMaterial[]).map(prepare)
        : prepare(mesh.material as MeshBasicMaterial)
    })
    return { object, materials }
  }, [gltf.scene, effect.color, wing])
  const mixer = useMemo(() => new AnimationMixer(object), [object])
  const holder = useRef<Group>(null),
    anchor = useRef<Group>(null),
    clock = useRef(0)
  useEffect(() => {
    // CSkaEffect::Start uses FindFirstAnimationID with AN_LOOPING.
    const clip = gltf.animations[0]
    if (clip) mixer.clipAction(clip).play()
    return () => {
      mixer.stopAllAction()
      mixer.uncacheRoot(object)
      object.traverse((child) => {
        const mesh = child as SkinnedMesh
        if (mesh.isSkinnedMesh) mesh.skeleton.dispose()
      })
    }
  }, [gltf.animations, mixer, object])
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials])
  useFrame((_, delta) => {
    clock.current += Math.min(delta, 0.1) * pace()
    if (!holder.current || !anchor.current) return
    target.object.updateWorldMatrix(true, true)
    holder.current.updateWorldMatrix(true, false)
    anchor.current.visible = placeArtifactWing(
      target,
      holder.current,
      anchor.current,
      wing,
      clock.current,
    )
    if (!anchor.current.visible) return
    mixer.setTime(clock.current - wing.delay)
  })
  return (
    <group ref={holder}>
      <group
        ref={anchor}
        visible={false}
        name={`artifact-tag:${wing.name}`}
        userData={{ sourceTag: wing.tag, sourceEffect: wing.name }}
      >
        <primitive object={object} />
      </group>
    </group>
  )
}
