import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, Group, Sprite, SpriteMaterial } from 'three'
import { hasRunBoost } from '../game/logic/combat.ts'
import { combatSession } from '../game/session/combatSession.ts'
import { shownGround } from './travelRoute.ts'
import { view } from './viewState.ts'

/**
 * The smoke under the feet of a hero whose run speed a buff or potion raises: the client's
 * EST_ASSIST_MOVESPD state effect "DK Normal State" (StatusEffect.cpp), its particle group
 * dkBottomFog' in Effect.dat: a cylinder emitter 30 a second around the feet (0.5…1.7 m out,
 * 0.3 m up, 0.1 m tall), particles living 0.7…0.8 s, 0.8…1.2 m wide, growing ×0.7 → ×1.2 (half
 * life) → ×1.4, alpha 80 with 0.2 s fade-in and 0.5 s fade-out, colour 171A2B…171717, alpha
 * blended, not attached to the hero (they stay where they rose while the hero runs on).
 */
const PER_SECOND = 30
const LIFE: [number, number] = [0.7, 0.8]
const WIDTH: [number, number] = [0.8, 1.2]
const RADIUS: [number, number] = [0.5, 1.7]
const CENTER_Y = 0.3
const HEIGHT = 0.1
const SIZE_TRACK: [number, number][] = [
  [0, 0.7],
  [0.5, 1.2],
  [0.8, 1.4],
]
const ALPHA = 80 / 255
const FADE_IN = 0.2
const FADE_OUT = 0.5
const COLORS = [
  new Color(0x17 / 255, 0x1a / 255, 0x2b / 255),
  new Color(0x17 / 255, 0x17 / 255, 0x17 / 255),
]
/** More than PER_SECOND × the longest life ever alive at once. */
const POOL = 32

const between = ([a, b]: [number, number]) => a + Math.random() * (b - a)

/** The size track at a share of the life (linear between its keys, the last one held). */
function sizeAt(t: number): number {
  for (let i = 1; i < SIZE_TRACK.length; i++) {
    const [t1, v1] = SIZE_TRACK[i]!
    const [t0, v0] = SIZE_TRACK[i - 1]!
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0)
  }
  return SIZE_TRACK.at(-1)![1]
}

interface Puff {
  /** Map point it rose at (the map moves under the hero while it runs). */
  x: number
  y: number
  z: number
  age: number
  life: number
  width: number
}

export function RunSmoke() {
  const texture = useTexture(`${import.meta.env.BASE_URL}fx/run-smoke.webp`)
  const group = useRef<Group>(null)
  const sprites = useMemo(
    () =>
      Array.from({ length: POOL }, (_, i) => {
        const sprite = new Sprite(
          new SpriteMaterial({
            map: texture,
            color: COLORS[i % COLORS.length],
            transparent: true,
            depthWrite: false,
            opacity: 0,
          }),
        )
        sprite.visible = false
        return sprite
      }),
    [texture],
  )
  const puffs = useRef<(Puff | null)[]>(Array.from({ length: POOL }, () => null))
  const owed = useRef(0)

  useFrame((_, dt) => {
    const step = Math.min(dt, 0.1)
    const ground = shownGround() ?? [0, 0]
    // where the hero stands, in map coordinates
    const heroX = ground[0] + view.player.x
    const heroZ = ground[1] + view.player.z
    const list = puffs.current
    if (hasRunBoost(combatSession.state.player)) {
      owed.current += step * PER_SECOND
      while (owed.current >= 1) {
        owed.current -= 1
        const free = list.indexOf(null)
        if (free < 0) break
        const angle = Math.random() * Math.PI * 2
        const r = between(RADIUS)
        list[free] = {
          x: heroX + Math.cos(angle) * r,
          y: CENTER_Y + (Math.random() - 0.5) * HEIGHT,
          z: heroZ + Math.sin(angle) * r,
          age: 0,
          life: between(LIFE),
          width: between(WIDTH),
        }
      }
    } else owed.current = 0
    list.forEach((puff, i) => {
      const sprite = sprites[i]!
      if (puff) {
        puff.age += step
        if (puff.age >= puff.life) list[i] = null
      }
      const p = list[i]
      sprite.visible = p !== null
      if (!p) return
      const lx = p.x - ground[0]
      const lz = p.z - ground[1]
      sprite.position.set(lx, view.groundY(lx, lz) + p.y, lz)
      const size = p.width * sizeAt(p.age / p.life)
      sprite.scale.set(size, size, 1)
      const fade = Math.min(1, p.age / FADE_IN, (p.life - p.age) / FADE_OUT)
      ;(sprite.material as SpriteMaterial).opacity = ALPHA * Math.max(0, fade)
    })
  })

  return (
    <group ref={group}>
      {sprites.map((sprite, i) => (
        <primitive key={i} object={sprite} />
      ))}
    </group>
  )
}
