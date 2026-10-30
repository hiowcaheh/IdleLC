import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  MeshBasicMaterial,
  SRGBColorSpace,
  SpriteMaterial,
  type Mesh,
  type Sprite,
  type Texture,
} from 'three'
import { getTitle } from '../game/data/titles.ts'
import { useGameStore } from '../state/gameStore.ts'
import { titleEffectColor } from '../ui/titles/format.ts'

const fxUrl = (name: string) => `${import.meta.env.BASE_URL}fx/${name}.webp`

/** Stars rising around the hero, and how long one takes to rise (seconds). */
const STARS = 7
const RISE_TIME = 2.2
const RISE_HEIGHT = 2.1

/**
 * A worn title with an effect (t_title a_effect_name) shows as a glow on the ground around the
 * hero and stars rising in its colour. Our own look: the client's Effect.dat is encrypted.
 */
export function TitleAura() {
  const activeTitle = useGameStore((s) => s.character?.activeTitle ?? null)
  const title = activeTitle === null ? undefined : getTitle(activeTitle)
  const color = title ? titleEffectColor(title) : null
  if (!color) return null
  return <Aura color={color} />
}

function Aura({ color }: { color: string }) {
  const [glow, ring, star] = useTexture([fxUrl('glow'), fxUrl('ring'), fxUrl('star')], (loaded) => {
    for (const t of loaded as Texture[]) t.colorSpace = SRGBColorSpace
  }) as Texture[]
  const floor = useRef<Mesh>(null)
  const band = useRef<Mesh>(null)
  const stars = useRef<(Sprite | null)[]>([])
  const clock = useRef(0)

  const materials = useMemo(() => {
    const tint = new Color(color)
    const ground = (map: Texture | undefined, opacity: number) =>
      new MeshBasicMaterial({
        map,
        color: tint,
        transparent: true,
        opacity,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    return {
      glow: ground(glow, 0.55),
      ring: ground(ring, 0.8),
      // each star fades on its own: a material each
      stars: Array.from(
        { length: STARS },
        () =>
          new SpriteMaterial({
            map: star,
            color: tint.clone().lerp(new Color('#ffffff'), 0.3),
            transparent: true,
            blending: AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }),
      ),
    }
  }, [color, glow, ring, star])

  useEffect(
    () => () => {
      materials.glow.dispose()
      materials.ring.dispose()
      materials.stars.forEach((m) => m.dispose())
    },
    [materials],
  )

  useFrame((_, delta) => {
    clock.current += Math.min(delta, 0.1)
    const t = clock.current
    const ground = floor.current?.material as MeshBasicMaterial | undefined
    if (ground) ground.opacity = 0.3 + 0.15 * Math.sin(t * 2)
    if (band.current) {
      band.current.rotation.z = t * 0.6
      band.current.scale.setScalar(1 + 0.06 * Math.sin(t * 2.6))
    }
    stars.current.forEach((sprite, i) => {
      if (!sprite) return
      // each star rises on its own beat, from a point on a circle round the hero
      const life = ((t + (i / STARS) * RISE_TIME) % RISE_TIME) / RISE_TIME
      const angle = i * 2.4 + Math.floor((t + (i / STARS) * RISE_TIME) / RISE_TIME) * 1.3
      sprite.position.set(Math.cos(angle) * 0.6, 0.1 + life * RISE_HEIGHT, Math.sin(angle) * 0.6)
      sprite.scale.setScalar(0.16 * Math.sin(life * Math.PI) + 0.02)
      sprite.material.opacity = Math.sin(life * Math.PI)
    })
  })

  return (
    <group>
      <mesh ref={floor} rotation-x={-Math.PI / 2} position-y={0.03} material={materials.glow}>
        <planeGeometry args={[2.2, 2.2]} />
      </mesh>
      <mesh ref={band} rotation-x={-Math.PI / 2} position-y={0.04} material={materials.ring}>
        <planeGeometry args={[1.7, 1.7]} />
      </mesh>
      {Array.from({ length: STARS }, (_, i) => (
        <sprite
          key={i}
          ref={(s) => {
            stars.current[i] = s
          }}
          material={materials.stars[i]}
          renderOrder={5}
        />
      ))}
    </group>
  )
}
