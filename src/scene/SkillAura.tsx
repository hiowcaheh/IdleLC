import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from 'three'
import type { SkillKind } from '../game/logic/skills.ts'
import { combatEvents } from '../state/combatEvents.ts'
import { useGameStore } from '../state/gameStore.ts'
import { view } from './viewState.ts'

const COLORS: Record<SkillKind, string> = {
  attack: '#ffb064',
  debuff: '#c99bff',
  buff: '#8fd2ff',
  heal: '#7dff95',
  passive: '#ffffff',
}

/** Shortest aura, in real seconds (instant skills still flash). */
const MIN_DURATION = 0.7

/**
 * Glow at the hero's feet while a skill is cast: a ring closing in for attacks, a rising
 * column of light for buffs and heals.
 */
export function SkillAura() {
  const group = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const column = useRef<Mesh>(null)
  const cast = useRef({ time: -1, duration: 1, selfCast: false, color: new Color() })

  useEffect(
    () =>
      combatEvents.subscribe((e) => {
        const c = cast.current
        if (e.type === 'cast' && e.source === 'player') {
          const speed = Math.max(1, useGameStore.getState().timeScale)
          c.time = 0
          c.duration = Math.max(MIN_DURATION, e.castTime / speed)
          c.selfCast = e.kind === 'buff' || e.kind === 'heal'
          c.color.set(COLORS[e.kind])
          for (const mesh of [ring.current, column.current]) {
            ;(mesh?.material as MeshBasicMaterial | undefined)?.color.copy(c.color)
          }
        } else if (e.type === 'death' || e.type === 'reset') {
          c.time = -1
        }
      }),
    [],
  )

  useFrame((_, delta) => {
    const g = group.current
    const c = cast.current
    if (!g) return
    if (c.time < 0) {
      g.visible = false
      return
    }
    c.time += Math.min(delta, 0.1)
    const k = c.time / c.duration
    if (k >= 1) {
      c.time = -1
      g.visible = false
      return
    }
    const fade = Math.min(1, k / 0.15) * (k > 0.8 ? (1 - k) / 0.2 : 1)
    g.visible = true
    g.position.set(view.player.x, 0, view.player.z)
    if (ring.current) {
      ring.current.scale.setScalar(c.selfCast ? 0.7 + k * 0.6 : 1.5 - k * 0.9)
      ring.current.rotation.z = k * 4
      ;(ring.current.material as MeshBasicMaterial).opacity = 0.9 * fade
    }
    if (column.current) {
      column.current.visible = c.selfCast
      column.current.scale.set(1, 0.4 + k * 0.8, 1)
      column.current.position.y = (0.4 + k * 0.8) * 1.1
      ;(column.current.material as MeshBasicMaterial).opacity = 0.35 * fade
    }
  })

  return (
    <group ref={group} visible={false}>
      <mesh ref={ring} position-y={0.06} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.62, 0.78, 48, 1]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={column}>
        <cylinderGeometry args={[0.55, 0.7, 2.2, 32, 1, true]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
