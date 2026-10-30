import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import {
  AdditiveBlending,
  type Camera,
  Color,
  DoubleSide,
  type Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Texture,
} from 'three'
import type { ClassId } from '../game/data/types.ts'
import { TIMINGS, type Side } from '../game/logic/combat.ts'
import type { SkillKind } from '../game/logic/skills.ts'
import { combatEvents } from '../state/combatEvents.ts'
import { useGameStore } from '../state/gameStore.ts'
import { view } from './viewState.ts'

/**
 * The client's effect textures (`npm run convert-lc -- --only fx`). Which effect a skill plays is
 * in the client's encrypted `Effect.dat`, so the effects are put together from these by skill kind.
 */
const FX = [
  'magic-circle',
  'shockwave',
  'ring',
  'explosion',
  'flash',
  'glow',
  'burst',
  'heal',
  'star',
  'spark-red',
  'spark-blue',
  'spark-yellow',
] as const
type Fx = (typeof FX)[number]

const FX_URLS = Object.fromEntries(
  FX.map((name) => [name, `${import.meta.env.BASE_URL}fx/${name}.webp`]),
) as Record<Fx, string>

/** The textures are colour pictures (sRGB). */
const inSrgb = (loaded: Record<string, Texture> | Texture[]) => {
  for (const texture of Object.values(loaded)) texture.colorSpace = SRGBColorSpace
}

/** Each class's colour of light, and its sparks. */
const CLASS_FX: Record<ClassId, { color: string; spark: Fx }> = {
  titan: { color: '#ff6a3d', spark: 'spark-red' },
  knight: { color: '#ffd76a', spark: 'spark-yellow' },
  healer: { color: '#86ff9a', spark: 'spark-yellow' },
  mage: { color: '#c493ff', spark: 'spark-blue' },
  rogue: { color: '#d6ff5a', spark: 'spark-yellow' },
  sorcerer: { color: '#6ad8ff', spark: 'spark-blue' },
}
/** Classes whose attack skills fly to the target (spells, arrows). */
const RANGED: ReadonlySet<ClassId> = new Set(['mage', 'healer', 'sorcerer'])
const MONSTER_FX = { color: '#ff7a5a', spark: 'spark-red' as Fx }
const CURSE = new Color('#b77bff')
const LEVEL_GOLD = new Color('#ffd76a')
const HEALING = new Color('#7dff95')

/** Particles alive at once; the oldest one is reused past that. */
const POOL_SIZE = 96
/** A spell's magic circle shows only for wind-ups longer than this (game seconds). */
const MIN_WIND_UP = 0.15

interface Particle {
  mesh: Mesh
  material: MeshBasicMaterial
  /** Real seconds since it started (negative while delayed). */
  age: number
  life: number
  /** Lies flat on the ground instead of facing the camera. */
  ground: boolean
  pos: Vector3
  vel: Vector3
  gravity: number
  from: number
  to: number
  spin: number
  /** Turn around its facing axis (radians). */
  roll: number
  opacity: number
  /** Share of the life spent fading in. */
  fadeIn: number
}

interface Spawn {
  fx: Fx
  at: Vector3
  /** Size at the start and at the end of its life (world units). */
  size: [number, number]
  life: number
  color?: Color
  opacity?: number
  ground?: boolean
  spin?: number
  vel?: Vector3
  gravity?: number
  delay?: number
  fadeIn?: number
}

/** A skill on its way: it lands at a time of the effects' game clock. */
interface Landing {
  at: number
  source: Side
  land(): void
}

/** Lighter version of a colour, so tinted textures keep their own light. */
const lighten = (color: Color, amount: number) => color.clone().lerp(new Color('#ffffff'), amount)

const random = (min: number, max: number) => min + Math.random() * (max - min)

/** A billboard turns around the axis it faces the camera along. */
const FACING = new Vector3(0, 0, 1)
const rollBy = new Quaternion()

/** Where a fighter is hit: its feet, its middle, and a size factor from its height. */
function bodyOf(side: Side) {
  const feet = (side === 'player' ? view.player : view.monster).clone()
  const height = side === 'player' ? view.playerHeight : view.monsterHeight
  const middle = feet.clone().setY(feet.y + height * 0.55)
  const scale = Math.min(2.2, Math.max(0.7, height / 1.8))
  return { feet, middle, scale }
}

/** Moves, grows, turns and fades a particle by a frame (real seconds). */
function animate(p: Particle, camera: Camera, realDt: number): void {
  if (p.age >= p.life) {
    p.mesh.visible = false
    return
  }
  p.age += realDt
  if (p.age < 0) {
    p.mesh.visible = false
    return
  }
  const k = Math.min(1, p.age / p.life)
  p.vel.y -= p.gravity * realDt
  p.pos.addScaledVector(p.vel, realDt)
  p.mesh.position.copy(p.pos)
  p.mesh.scale.setScalar(p.from + (p.to - p.from) * (1 - (1 - k) * (1 - k)))
  p.roll += p.spin * realDt
  if (p.ground) p.mesh.rotation.set(-Math.PI / 2, 0, p.roll)
  else p.mesh.quaternion.copy(camera.quaternion).multiply(rollBy.setFromAxisAngle(FACING, p.roll))
  const fadeIn = Math.min(1, k / p.fadeIn)
  p.material.opacity = p.opacity * fadeIn * (k > 0.55 ? (1 - k) / 0.45 : 1)
  p.mesh.visible = true
}

/**
 * Skill effects from the client's effect textures: a magic circle under a spell being cast, then
 * a burst of light, sparks and a shockwave where an attack lands, a curse closing in on a
 * debuffed target, rising stars around a buff and a healing circle — in the caster's class colour;
 * and the golden burst of a level up.
 */
export function SkillEffects() {
  const textures = useTexture(FX_URLS, inSrgb) as Record<Fx, Texture>
  const group = useRef<Group>(null)
  const pool = useRef<Particle[]>([])
  const landings = useRef<Landing[]>([])
  /** Game seconds since the effects came on screen (landings are due at a time on it). */
  const clock = useRef(0)
  // drawn once while fully transparent, so the first skill does not stall on compiling shaders
  const warmedUp = useRef(false)

  useEffect(() => {
    const holder = group.current
    if (!holder) return
    const geometry = new PlaneGeometry(1, 1)
    const particles = Array.from({ length: POOL_SIZE }, (): Particle => {
      const material = new MeshBasicMaterial({
        map: textures.glow,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      })
      const mesh = new Mesh(geometry, material)
      mesh.visible = false
      mesh.frustumCulled = false
      holder.add(mesh)
      return {
        mesh,
        material,
        age: 0,
        life: 0,
        ground: false,
        pos: new Vector3(),
        vel: new Vector3(),
        gravity: 0,
        from: 1,
        to: 1,
        spin: 0,
        roll: 0,
        opacity: 1,
        fadeIn: 0.1,
      }
    })
    pool.current = particles
    warmedUp.current = false
    return () => {
      pool.current = []
      for (const p of particles) {
        holder.remove(p.mesh)
        p.material.dispose()
      }
      geometry.dispose()
    }
  }, [textures])

  useEffect(() => {
    const spawn = (s: Spawn) => {
      const particles = pool.current
      const p =
        particles.find((q) => q.age >= q.life) ??
        particles.reduce((oldest, q) => (q.age / q.life > oldest.age / oldest.life ? q : oldest))
      if (!p) return
      p.age = -(s.delay ?? 0)
      p.life = s.life
      p.ground = s.ground ?? false
      p.pos.copy(s.at)
      if (p.ground) p.pos.y = 0.03 + particles.indexOf(p) * 0.0015
      p.vel.copy(s.vel ?? new Vector3())
      p.gravity = s.gravity ?? 0
      ;[p.from, p.to] = s.size
      p.spin = s.spin ?? 0
      p.roll = Math.random() * Math.PI * 2
      p.opacity = s.opacity ?? 1
      p.fadeIn = s.fadeIn ?? 0.1
      p.material.map = textures[s.fx]
      p.material.color.copy(s.color ?? new Color('#ffffff'))
      // flat effects sit under the fighters, light in the air shows over them
      p.material.depthTest = p.ground
      p.mesh.renderOrder = p.ground ? 5 : 10
    }

    const style = (source: Side) => {
      if (source === 'monster')
        return { color: new Color(MONSTER_FX.color), spark: MONSTER_FX.spark }
      const classId = useGameStore.getState().character?.classId ?? 'knight'
      const { color, spark } = CLASS_FX[classId]
      return { color: new Color(color), spark }
    }

    const circle = (at: Vector3, color: Color, scale: number, life: number) =>
      spawn({
        fx: 'magic-circle',
        at,
        ground: true,
        size: [0.9 * scale, 1.6 * scale],
        life,
        color: lighten(color, 0.35),
        spin: 1.6,
        fadeIn: Math.min(0.4, 0.25 / life),
      })

    const impact = (target: Side, color: Color, spark: Fx) => {
      const { feet, middle, scale: s } = bodyOf(target)
      const light = lighten(color, 0.55)
      spawn({ fx: 'flash', at: middle, size: [0.6 * s, 3 * s], life: 0.3, fadeIn: 0.05 })
      spawn({ fx: 'burst', at: middle, size: [0.6 * s, 2.6 * s], life: 0.4, color, spin: 3 })
      spawn({
        fx: 'explosion',
        at: middle,
        size: [0.8 * s, 2 * s],
        life: 0.55,
        color: light,
        spin: 1.5,
        delay: 0.03,
      })
      spawn({ fx: 'shockwave', at: feet, ground: true, size: [0.6 * s, 3.6 * s], life: 0.6, color })
      spawn({
        fx: 'ring',
        at: feet,
        ground: true,
        size: [0.5 * s, 2.8 * s],
        life: 0.45,
        color: light,
        delay: 0.08,
      })
      for (let i = 0; i < 8; i++) {
        const dir = new Vector3(random(-1, 1), random(0.2, 1.2), random(-1, 1)).normalize()
        spawn({
          fx: spark,
          at: middle,
          size: [0.55 * s, 0.15 * s],
          life: random(0.45, 0.7),
          vel: dir.multiplyScalar(random(2.5, 4.5) * s),
          gravity: 7,
          fadeIn: 0.02,
        })
      }
    }

    const curse = (target: Side) => {
      const { feet, middle, scale: s } = bodyOf(target)
      spawn({
        fx: 'burst',
        at: middle,
        size: [0.5 * s, 2.2 * s],
        life: 0.5,
        color: CURSE,
        spin: -2,
      })
      spawn({
        fx: 'ring',
        at: feet,
        ground: true,
        size: [2.6 * s, 0.6 * s],
        life: 0.75,
        color: CURSE,
        fadeIn: 0.2,
      })
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        spawn({
          fx: 'star',
          at: middle
            .clone()
            .add(new Vector3(Math.cos(a) * 0.5 * s, random(0, 0.5) * s, Math.sin(a) * 0.5 * s)),
          size: [0.45 * s, 0.25 * s],
          life: random(0.7, 0.95),
          color: lighten(CURSE, 0.3),
          vel: new Vector3(0, 0.7, 0),
          spin: 4,
          delay: i * 0.04,
        })
      }
    }

    const aura = (side: Side, color: Color) => {
      const { feet, middle, scale: s } = bodyOf(side)
      spawn({
        fx: 'burst',
        at: middle,
        size: [1.2 * s, 2.8 * s],
        life: 0.9,
        color,
        spin: 0.8,
        opacity: 0.8,
      })
      spawn({ fx: 'ring', at: feet, ground: true, size: [0.4 * s, 2.6 * s], life: 0.7, color })
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + random(-0.3, 0.3)
        spawn({
          fx: 'star',
          at: feet
            .clone()
            .add(new Vector3(Math.cos(a) * 0.55 * s, random(0.2, 0.9) * s, Math.sin(a) * 0.55 * s)),
          size: [0.38 * s, 0.14 * s],
          life: random(0.9, 1.2),
          color: lighten(color, 0.4),
          vel: new Vector3(0, random(1.4, 2) * s, 0),
          spin: 3,
          delay: random(0, 0.25),
        })
      }
    }

    const healing = (side: Side) => {
      const { feet, middle, scale: s } = bodyOf(side)
      spawn({
        fx: 'heal',
        at: feet,
        ground: true,
        size: [1.2 * s, 2.2 * s],
        life: 1.1,
        color: lighten(HEALING, 0.3),
        spin: 0.8,
        fadeIn: 0.15,
      })
      spawn({
        fx: 'burst',
        at: middle,
        size: [1 * s, 2.4 * s],
        life: 0.8,
        color: HEALING,
        opacity: 0.7,
      })
      for (let i = 0; i < 10; i++) {
        const a = random(0, Math.PI * 2)
        const r = random(0.2, 0.6) * s
        spawn({
          fx: 'spark-yellow',
          at: feet.clone().add(new Vector3(Math.cos(a) * r, random(0, 0.6) * s, Math.sin(a) * r)),
          size: [0.45 * s, 0.15 * s],
          life: random(0.8, 1.2),
          color: HEALING,
          vel: new Vector3(0, random(1.6, 2.6) * s, 0),
          delay: random(0, 0.3),
        })
      }
    }

    /** A glowing missile from the caster's hands to the target, `flight` game seconds long. */
    const missile = (source: Side, flight: number) => {
      const from = bodyOf(source).middle
      const to = bodyOf(source === 'player' ? 'monster' : 'player').middle
      const time = flight / Math.max(1, useGameStore.getState().timeScale)
      const vel = to.sub(from).divideScalar(time)
      const { color } = style(source)
      spawn({ fx: 'flash', at: from, size: [1.4, 1.1], life: time, vel, fadeIn: 0.1 })
      for (let i = 0; i < 4; i++) {
        spawn({
          fx: 'burst',
          at: from,
          size: [0.9 - i * 0.15, 0.7 - i * 0.12],
          life: time,
          color,
          vel,
          spin: 6,
          delay: i * 0.035,
          opacity: 1 - i * 0.2,
        })
      }
    }

    /** A level up (with LevelUpEffect's golden pillar): a gold circle opening under the hero, a
     * shockwave, a flash and golden stars spiralling up. */
    const levelUp = () => {
      const { feet, middle } = bodyOf('player')
      const light = lighten(LEVEL_GOLD, 0.3)
      spawn({
        fx: 'magic-circle',
        at: feet,
        ground: true,
        size: [0.6, 3.2],
        life: 2.2,
        color: lighten(LEVEL_GOLD, 0.15),
        spin: 1.2,
        fadeIn: 0.08,
      })
      spawn({
        fx: 'shockwave',
        at: feet,
        ground: true,
        size: [0.5, 5],
        life: 0.9,
        color: LEVEL_GOLD,
      })
      spawn({
        fx: 'ring',
        at: feet,
        ground: true,
        size: [0.5, 3.6],
        life: 0.7,
        color: light,
        delay: 0.15,
      })
      spawn({ fx: 'flash', at: middle, size: [1, 4.2], life: 0.5, fadeIn: 0.05 })
      spawn({ fx: 'burst', at: middle, size: [1.2, 3.4], life: 1, color: LEVEL_GOLD, spin: 1.5 })
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 4
        spawn({
          fx: i % 3 === 0 ? 'star' : 'spark-yellow',
          at: feet.clone().add(new Vector3(Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7)),
          size: [0.5, 0.15],
          life: random(1.1, 1.6),
          color: light,
          vel: new Vector3(-Math.sin(a) * 0.8, random(1.8, 2.8), Math.cos(a) * 0.8),
          spin: 3,
          delay: i * 0.03,
        })
      }
    }

    const land = (source: Side, kind: SkillKind) => {
      const target: Side = source === 'player' ? 'monster' : 'player'
      const { color, spark } = style(source)
      if (kind === 'attack') impact(target, color, spark)
      else if (kind === 'debuff') curse(target)
      else if (kind === 'buff') aura(source, color)
      else if (kind === 'heal') healing(source)
    }

    return combatEvents.subscribe((e) => {
      if (e.type === 'cast') {
        const windUp = e.castTime - TIMINGS.impactDelay
        if (e.kind === 'passive') return
        if (windUp > MIN_WIND_UP || e.kind !== 'attack') {
          const { feet, scale } = bodyOf(e.source)
          const speed = Math.max(1, useGameStore.getState().timeScale)
          circle(feet, style(e.source).color, scale, Math.max(0.5, e.castTime / speed + 0.2))
        }
        const classId = useGameStore.getState().character?.classId
        if (
          e.source === 'player' &&
          (e.kind === 'attack' || e.kind === 'debuff') &&
          classId &&
          RANGED.has(classId)
        ) {
          // released with the blow's swing, it flies for the rest of it
          const flight = Math.min(e.castTime, TIMINGS.impactDelay * 0.6)
          landings.current.push({
            at: clock.current + e.castTime - flight,
            source: e.source,
            land: () => missile(e.source, flight),
          })
        }
        landings.current.push({
          at: clock.current + e.castTime,
          source: e.source,
          land: () => land(e.source, e.kind),
        })
      } else if (e.type === 'effect' && e.kind === 'stun') {
        // a stun breaks the cast in progress
        landings.current = landings.current.filter((l) => l.source !== e.target)
      } else if (e.type === 'death') {
        landings.current = landings.current.filter((l) => l.source !== e.who)
      } else if (e.type === 'levelUp') {
        levelUp()
      } else if (e.type === 'reset') {
        landings.current = []
        for (const p of pool.current) p.age = p.life
      }
    })
  }, [textures])

  useFrame(({ camera }, delta) => {
    const realDt = Math.min(delta, 0.1)
    const now = (clock.current += realDt * useGameStore.getState().timeScale)
    if (landings.current.some((l) => l.at <= now)) {
      const due = landings.current.filter((l) => l.at <= now)
      landings.current = landings.current.filter((l) => l.at > now)
      for (const l of due) l.land()
    }

    for (const p of pool.current) animate(p, camera, realDt)

    const first = pool.current[0]
    if (!warmedUp.current && first) {
      warmedUp.current = true
      first.mesh.visible = true
      first.material.opacity = 0
    }
  })

  return <group ref={group} />
}
