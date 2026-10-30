import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  MeshBasicMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  SpriteMaterial,
  type Mesh,
  type Sprite,
  type Texture,
} from 'three'
import type { ClassId } from '../game/data/types.ts'

/**
 * The weapon's upgrade (+) shows on the hero from these steps on: lights in the class's colour
 * circling the hero, more and brighter at each step, and the class's rune rings from +10.
 * The pieces are the client's (`*_weapon_plus_ring`, `Common_weapon_plus_glow`); how they are put
 * together is our own (the client's Effect.dat is encrypted).
 */
const AURA_STEPS = [4, 6, 8, 10, 15] as const

interface Look {
  /** Lights circling the hero. */
  lights: number
  /** Size of a light's glow (metres). */
  size: number
  /** Fading copies behind each light. */
  trail: number
  /** Rune rings: none, at the feet, at the feet and the chest. */
  rings: 0 | 1 | 2
}

const LOOKS: Record<(typeof AURA_STEPS)[number], Look> = {
  4: { lights: 1, size: 0.32, trail: 4, rings: 0 },
  6: { lights: 1, size: 0.42, trail: 7, rings: 0 },
  8: { lights: 2, size: 0.42, trail: 7, rings: 0 },
  10: { lights: 2, size: 0.5, trail: 9, rings: 1 },
  15: { lights: 3, size: 0.6, trail: 11, rings: 2 },
}

/** The highest step a weapon at this + has reached, or null below +4. */
function auraStep(plus: number): (typeof AURA_STEPS)[number] | null {
  let step: (typeof AURA_STEPS)[number] | null = null
  for (const s of AURA_STEPS) if (plus >= s) step = s
  return step
}

/** Each class's light, and the rune ring texture it wears (the Sorcerer has none of its own). */
const CLASS_AURA: Record<ClassId, { color: string; ring: string; tint?: string }> = {
  titan: { color: '#ff4a26', ring: 'plus-ring-titan' },
  knight: { color: '#4fb4ff', ring: 'plus-ring-knight' },
  healer: { color: '#ffd24a', ring: 'plus-ring-healer' },
  mage: { color: '#b46bff', ring: 'plus-ring-mage' },
  rogue: { color: '#ff9a2e', ring: 'plus-ring-rogue' },
  sorcerer: { color: '#3dffb0', ring: 'plus-ring-knight', tint: '#3dffb0' },
}

const fxUrl = (name: string) => `${import.meta.env.BASE_URL}fx/${name}.webp`

/** Orbit of the lights around the hero (metres, radians a second). */
const ORBIT_RADIUS = 0.8
const ORBIT_SPEED = 2.1
const LOW = 0.55
const HIGH = 1.75
/** Seconds between a light and each copy in its trail. */
const TRAIL_GAP = 0.035
const RING_RADIUS = 0.7

/** Where a light is at a time: circling, rising and sinking (relative to the hero's feet). */
function lightAt(t: number, phase: number, out: { x: number; y: number; z: number }) {
  const a = t * ORBIT_SPEED + phase
  out.x = Math.cos(a) * ORBIT_RADIUS
  out.z = Math.sin(a) * ORBIT_RADIUS
  out.y = LOW + (HIGH - LOW) * (0.5 + 0.5 * Math.sin(t * 1.3 + phase * 1.7))
}

export function UpgradeAura({ classId, plus }: { classId: ClassId; plus: number }) {
  const step = auraStep(plus)
  if (step === null) return null
  return <Aura classId={classId} look={LOOKS[step]} />
}

function Aura({ classId, look }: { classId: ClassId; look: Look }) {
  const aura = CLASS_AURA[classId]
  const [glow, rune] = useTexture([fxUrl('plus-glow'), fxUrl(aura.ring)], (loaded) => {
    for (const t of loaded as Texture[]) t.colorSpace = SRGBColorSpace
  }) as Texture[]

  const sprites = useRef<(Sprite | null)[]>([])
  const rings = useRef<(Mesh | null)[]>([])
  const clock = useRef(0)

  // a light and its trail: the copies further back are smaller and fainter
  const materials = useMemo(() => {
    const color = new Color(aura.color)
    return Array.from(
      { length: look.trail + 1 },
      (_, k) =>
        new SpriteMaterial({
          map: glow,
          color: k === 0 ? color.clone().lerp(new Color('#ffffff'), 0.35) : color,
          transparent: true,
          opacity: k === 0 ? 1 : 0.75 * (1 - k / (look.trail + 1)),
          blending: AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
    )
  }, [glow, aura.color, look.trail])

  const ring = useMemo(() => {
    const texture = rune!.clone()
    texture.wrapS = RepeatWrapping
    texture.repeat.set(2, 1)
    texture.needsUpdate = true
    return {
      geometry: new CylinderGeometry(RING_RADIUS, RING_RADIUS, 0.22, 48, 1, true),
      material: new MeshBasicMaterial({
        map: texture,
        color: new Color(aura.tint ?? '#ffffff'),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      }),
    }
  }, [rune, aura.tint])

  useEffect(
    () => () => {
      materials.forEach((m) => m.dispose())
      ring.geometry.dispose()
      ring.material.map?.dispose()
      ring.material.dispose()
    },
    [materials, ring],
  )

  useFrame((_, delta) => {
    clock.current += Math.min(delta, 0.1)
    const t = clock.current
    const at = { x: 0, y: 0, z: 0 }
    for (let light = 0; light < look.lights; light++) {
      const phase = (light / look.lights) * Math.PI * 2
      for (let k = 0; k <= look.trail; k++) {
        const sprite = sprites.current[light * (look.trail + 1) + k]
        if (!sprite) continue
        lightAt(t - k * TRAIL_GAP, phase, at)
        sprite.position.set(at.x, at.y, at.z)
        const size = look.size * (k === 0 ? 1 : 0.85 * (1 - k / (look.trail + 2)))
        // the head flickers a little, like a living light
        const flicker = k === 0 ? 1 + 0.12 * Math.sin(t * 17 + light) : 1
        sprite.scale.setScalar(size * flicker)
      }
    }
    rings.current.forEach((mesh, i) => {
      if (!mesh) return
      mesh.rotation.y = (i === 0 ? 1 : -1.4) * t * 0.9
      ;(mesh.material as MeshBasicMaterial).opacity = 0.75 + 0.25 * Math.sin(t * 2.4 + i)
    })
  })

  return (
    <group>
      {Array.from({ length: look.lights }, (_, light) =>
        materials.map((material, k) => (
          <sprite
            key={`${light}-${k}`}
            ref={(s) => {
              sprites.current[light * (look.trail + 1) + k] = s
            }}
            material={material}
            renderOrder={5}
          />
        )),
      )}
      {Array.from({ length: look.rings }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            rings.current[i] = m
          }}
          geometry={ring.geometry}
          material={ring.material}
          position-y={i === 0 ? 0.12 : 1.15}
          scale={i === 0 ? 1 : 0.85}
          renderOrder={5}
        />
      ))}
    </group>
  )
}
