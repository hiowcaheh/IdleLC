import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  DataTexture,
  DoubleSide,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type PointLight,
} from 'three'
import { combatEvents } from '../state/combatEvents.ts'
import { view } from './viewState.ts'

const DURATION = 1.8

/** Vertical alpha gradient: bright at the feet, fading out towards the top. */
function fadeTexture(): DataTexture {
  const size = 64
  const data = new Uint8Array(size * 4)
  for (let i = 0; i < size; i++) {
    const v = Math.round(255 * Math.pow(1 - i / (size - 1), 1.6))
    data.set([v, v, v, 255], i * 4)
  }
  const texture = new DataTexture(data, 1, size)
  texture.needsUpdate = true
  return texture
}

/** Golden pillar and a rising ring around the hero when they level up. */
export function LevelUpEffect() {
  const group = useRef<Group>(null)
  const pillar = useRef<Mesh>(null)
  const ring = useRef<Mesh>(null)
  // the light stays mounted (intensity 0) so a level up does not recompile shaders
  const light = useRef<PointLight>(null)
  const time = useRef(-1)
  // drawn once while fully transparent, so the first level up does not stall on compiling shaders
  const warmedUp = useRef(false)
  const alphaMap = useMemo(() => fadeTexture(), [])

  useEffect(() => () => alphaMap.dispose(), [alphaMap])
  useEffect(
    () =>
      combatEvents.subscribe((e) => {
        if (e.type === 'levelUp') time.current = 0
      }),
    [],
  )

  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    if (time.current < 0) {
      if (warmedUp.current) g.visible = false
      warmedUp.current = true
      return
    }
    time.current += Math.min(delta, 0.1)
    const k = time.current / DURATION
    if (k >= 1) {
      time.current = -1
      g.visible = false
      if (light.current) light.current.intensity = 0
      return
    }
    const fade = k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88
    g.visible = true
    g.position.set(view.player.x, 0, view.player.z)
    if (pillar.current) {
      pillar.current.scale.set(1 + k * 0.35, 1 + k * 0.2, 1 + k * 0.35)
      ;(pillar.current.material as MeshBasicMaterial).opacity = 0.75 * fade
    }
    if (ring.current) {
      ring.current.position.y = 0.05 + k * 2.6
      ring.current.scale.setScalar(1 + k * 0.5)
      ;(ring.current.material as MeshBasicMaterial).opacity = 1 - k
    }
    if (light.current) light.current.intensity = 8 * fade
  })

  return (
    <group ref={group}>
      <mesh ref={pillar} position-y={1.3}>
        <cylinderGeometry args={[0.75, 0.75, 2.6, 32, 1, true]} />
        <meshBasicMaterial
          color="#ffd77a"
          alphaMap={alphaMap}
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[0.85, 0.045, 8, 56]} />
        <meshBasicMaterial
          color="#fff1b8"
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <pointLight ref={light} position-y={1.4} color="#ffd77a" intensity={0} distance={7} />
    </group>
  )
}
