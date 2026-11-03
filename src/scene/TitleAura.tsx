import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  type Group,
  type InstancedMesh,
  type Texture,
} from 'three'
import recovered from '../game/data/generated/lc-title-effects.json'
import { titleParticle, titleParticleCount, type TitleParticleGroup } from './titleEffects.ts'
import { additiveEffectMaterial, placeSourceTag, type UpgradeTarget } from './upgradeEffects.ts'

interface TitleEffects {
  groups: Record<
    string,
    { effects: { time: number; name: string }[]; tags: { effect: number; name: string }[] }
  >
  effects: Record<string, { particleGroup: string }>
  particles: Record<string, TitleParticleGroup>
  textures: Record<string, { url: string; sha256: string; width: number; height: number }>
}
const data = recovered as unknown as TitleEffects

/** Source title groups are three body-centred emitters, with no ground geometry. */
export function TitleAura({ effectName, target }: { effectName: string; target: UpgradeTarget }) {
  const definition = data.groups[effectName]
  if (!definition) return null
  return (
    <group name="title-smoke">
      {definition.effects.map((effect, index) => {
        const particle = data.particles[data.effects[effect.name]!.particleGroup]!
        const tag = definition.tags.find((tag) => tag.effect === index)?.name
        return tag ? (
          <TitleParticles
            key={effect.name}
            particle={particle}
            target={target}
            tag={tag}
            delay={effect.time}
          />
        ) : null
      })}
    </group>
  )
}
function prepareTexture(texture: Texture | Texture[]) {
  for (const item of Array.isArray(texture) ? texture : [texture]) {
    item.colorSpace = SRGBColorSpace
    item.premultiplyAlpha = false
  }
}
function TitleParticles({
  particle,
  target,
  tag,
  delay,
}: {
  particle: TitleParticleGroup
  target: UpgradeTarget
  tag: string
  delay: number
}) {
  const asset = data.textures[particle.textureAsset]!
  const texture = useTexture(
    `${import.meta.env.BASE_URL}${asset.url}?v=${asset.sha256.slice(0, 12)}`,
    prepareTexture,
  )
  const holder = useRef<Group>(null),
    anchor = useRef<Group>(null),
    mesh = useRef<InstancedMesh>(null),
    clock = useRef(0)
  const dummy = useMemo(() => new Object3D(), []),
    worldQuaternion = useMemo(() => new Quaternion(), []),
    faceCamera = useMemo(() => new Quaternion(), []),
    roll = useMemo(() => new Quaternion(), []),
    color = useMemo(() => new Color(), [])
  const count = titleParticleCount(particle)
  const { geometry, material } = useMemo(() => {
    const geometry = new PlaneGeometry(1, 1),
      uv = geometry.getAttribute('uv')
    for (let i = 0; i < uv.count; i++)
      uv.setXY(
        i,
        ((uv.getX(i) + particle.col) * particle.mexWidth) / asset.width,
        1 - ((1 - uv.getY(i) + particle.row) * particle.mexHeight) / asset.height,
      )
    const opacity = new InstancedBufferAttribute(new Float32Array(count), 1)
    opacity.setUsage(DynamicDrawUsage)
    geometry.setAttribute('instanceOpacity', opacity)
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
    if (particle.blend === 206) additiveEffectMaterial(material)
    else {
      material.blending = NormalBlending
      material.premultipliedAlpha = false
    }
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float instanceOpacity;\nvarying float vInstanceOpacity;',
        )
        .replace(
          '#include <color_vertex>',
          '#include <color_vertex>\nvInstanceOpacity = instanceOpacity;',
        )
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vInstanceOpacity;')
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.a *= vInstanceOpacity;',
        )
    }
    material.customProgramCacheKey = () => 'title-particle-opacity-v1'
    return { geometry, material }
  }, [particle, asset.width, asset.height, count, texture])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  useFrame(({ camera }, delta) => {
    clock.current += Math.min(delta, 0.1)
    if (!holder.current || !anchor.current || !mesh.current) return
    const opacity = mesh.current.geometry.getAttribute(
      'instanceOpacity',
    ) as InstancedBufferAttribute
    const time = clock.current - delay
    target.object.updateWorldMatrix(true, true)
    holder.current.updateWorldMatrix(true, false)
    anchor.current.visible =
      time >= 0 && placeSourceTag(target, tag, holder.current, anchor.current)
    if (!anchor.current.visible) return
    anchor.current.updateWorldMatrix(true, true)
    anchor.current.getWorldQuaternion(worldQuaternion)
    faceCamera.copy(worldQuaternion).invert().multiply(camera.quaternion)
    for (let index = 0; index < count; index++) {
      const state = titleParticle(particle, index, time)
      if (state) {
        dummy.position.fromArray(state.position)
        dummy.quaternion.copy(faceCamera)
        roll.set(0, 0, Math.sin(state.rotation / 2), Math.cos(state.rotation / 2))
        dummy.quaternion.multiply(roll)
        dummy.scale.setScalar(state.diameter)
        color.setRGB(
          state.color[0]! / 255,
          state.color[1]! / 255,
          state.color[2]! / 255,
          SRGBColorSpace,
        )
        mesh.current.setColorAt(index, color)
      } else dummy.scale.setScalar(0)
      dummy.updateMatrix()
      mesh.current.setMatrixAt(index, dummy.matrix)
      opacity.setX(index, state?.alpha ?? 0)
    }
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
    opacity.needsUpdate = true
  })
  return (
    <group ref={holder}>
      <group ref={anchor}>
        <instancedMesh
          ref={mesh}
          args={[geometry, material, count]}
          name={`title-particles:${particle.name}`}
          frustumCulled={false}
          renderOrder={4}
        />
      </group>
    </group>
  )
}
