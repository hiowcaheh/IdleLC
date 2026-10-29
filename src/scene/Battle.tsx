import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useRef } from 'react'
import { Vector3, type Group } from 'three'
import { getModel, playerModelId } from '../game/assets/manifest.ts'
import { getMonster } from '../game/data/monsters.ts'
import { TIMINGS, type Side } from '../game/logic/combat.ts'
import { combatSession } from '../game/session/combatSession.ts'
import { combatEvents, type ViewEvent } from '../state/combatEvents.ts'
import { useFloatingTexts, type FloatingKind } from '../state/floatingTexts.ts'
import { useGameStore } from '../state/gameStore.ts'
import { Character, type CharacterHandle } from './Character.tsx'
import { DamageNumbers } from './DamageNumbers.tsx'
import { HpBar3D } from './HpBar3D.tsx'
import { ARENA_RADIUS, smoothstep } from './terrain.ts'
import { SCREEN_RIGHT, resetView, view } from './viewState.ts'

/** How far the player runs to reach a newly spawned monster. */
const RUN_DISTANCE = 3.8
const APPEAR_TIME = 0.45
const SINK_TIME = 0.7
const TURN_SPEED = 10
const HUD_SYNC_INTERVAL = 0.1

const UP = new Vector3(0, 1, 0)

/** Distance between fighters' centers while trading blows, from the models' sizes. */
function engageDistance(monsterId: string, playerModel: string): number {
  const def = getMonster(monsterId)
  const model = getModel(def.modelId)
  const hero = getModel(playerModel)
  const monsterRadius = (model.radius ?? 0.6) * model.scale * (def.scale ?? 1)
  // the player's bounds include the weapon, so only part of them counts
  const heroRadius = (hero.radius ?? 0.5) * hero.scale * 0.6
  return Math.min(6, Math.max(1.5, heroRadius + monsterRadius + 0.5))
}

function yawTowards(from: Vector3, to: Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z)
}

function turn(group: Group, yaw: number, dt: number): void {
  let diff = yaw - group.rotation.y
  diff = Math.atan2(Math.sin(diff), Math.cos(diff))
  group.rotation.y += diff * Math.min(1, dt * TURN_SPEED)
}

export function Battle() {
  const monsterId = useGameStore((s) => s.hud.monsterId)
  const monsterDef = getMonster(monsterId)
  const monsterModel = monsterDef.modelId
  const showNumbers = useGameStore((s) => s.save.settings.showDamageNumbers)
  const classId = useGameStore((s) => s.character?.classId ?? 'knight')
  const playerModel = playerModelId(classId)
  const playerModelRef = useRef(playerModel)
  useEffect(() => {
    playerModelRef.current = playerModel
  }, [playerModel])

  const playerGroup = useRef<Group>(null)
  const monsterGroup = useRef<Group>(null)
  const player = useRef<CharacterHandle>(null)
  const monster = useRef<CharacterHandle>(null)
  const motion = useRef({
    approachFrom: new Vector3(),
    engageAt: new Vector3(),
    appear: 1,
    sink: -1,
    hudTimer: 0,
  })
  const showNumbersRef = useRef(showNumbers)
  useEffect(() => {
    showNumbersRef.current = showNumbers
  }, [showNumbers])

  // Bring visuals in line with whatever phase the (persistent) combat is in on mount.
  useEffect(() => {
    const combat = combatSession.state
    resetView()
    if (combat.phase !== 'spawning') {
      const engage = engageDistance(combat.monsterId, playerModelRef.current)
      view.monster.copy(SCREEN_RIGHT).multiplyScalar(engage + RUN_DISTANCE)
      view.monsterVisible = true
      motion.current.approachFrom.set(0, 0, 0)
      motion.current.engageAt.copy(SCREEN_RIGHT).multiplyScalar(RUN_DISTANCE)
      if (combat.phase !== 'approach') view.player.copy(motion.current.engageAt)
    }
  }, [])

  useEffect(() => {
    const textAt = (side: Side, text: string, kind: FloatingKind) => {
      if (!showNumbersRef.current) return
      const pos = side === 'player' ? view.player : view.monster
      const handle = side === 'player' ? player.current : monster.current
      const height = handle?.height() ?? 1.8
      const jitter = (Math.random() - 0.5) * 0.5
      useFloatingTexts.getState().add(text, kind, [pos.x + jitter, height + 0.45, pos.z])
    }

    /** Rewards float above the player (shown even with damage numbers off). */
    const rewardText = (text: string, kind: FloatingKind, lift: number) => {
      const height = player.current?.height() ?? 1.8
      useFloatingTexts
        .getState()
        .add(text, kind, [view.player.x, height + 0.7 + lift, view.player.z])
    }

    const onEvent = (e: ViewEvent) => {
      const m = motion.current
      switch (e.type) {
        case 'spawn': {
          // Spawn to the left or right of the player as seen by the camera, so neither fighter
          // hides the other; usually on the side that keeps the hunt near the arena center.
          const towardCenter = -Math.sign(view.player.dot(SCREEN_RIGHT)) || 1
          const side = Math.random() < 0.75 ? towardCenter : -towardCenter
          const dir = SCREEN_RIGHT.clone()
            .multiplyScalar(side)
            .applyAxisAngle(UP, (Math.random() - 0.5) * 0.7)
          const engage = engageDistance(e.monsterId, playerModelRef.current)
          view.monster.copy(view.player).addScaledVector(dir, engage + RUN_DISTANCE)
          if (view.monster.length() > ARENA_RADIUS) view.monster.setLength(ARENA_RADIUS)
          dir.subVectors(view.monster, view.player).normalize()
          m.approachFrom.copy(view.player)
          m.engageAt.copy(view.monster).addScaledVector(dir, -engage)
          view.monsterVisible = true
          m.appear = 0
          m.sink = -1
          monsterGroup.current?.rotation.set(0, yawTowards(view.monster, view.player), 0)
          monster.current?.revive()
          monster.current?.setBase('idle')
          player.current?.setBase('run')
          break
        }
        case 'engage':
          player.current?.setBase('idle')
          break
        case 'attack':
          ;(e.source === 'player' ? player : monster).current?.attack()
          break
        case 'hit':
          ;(e.target === 'player' ? player : monster).current?.hit(e.crit)
          textAt(
            e.target,
            e.crit ? `${e.amount}!` : String(e.amount),
            e.target === 'player' ? 'taken' : e.crit ? 'crit' : 'dealt',
          )
          break
        case 'miss':
          textAt(e.target, 'Miss', 'miss')
          break
        case 'death':
          if (e.who === 'monster') {
            monster.current?.die()
            player.current?.victory()
          } else {
            player.current?.die()
            monster.current?.setBase('idle')
          }
          break
        case 'despawn':
          if (view.monsterVisible) m.sink = 0
          break
        case 'revive':
          player.current?.revive()
          player.current?.setBase('idle')
          break
        case 'reward':
          if (e.exp > 0) rewardText(`+${e.exp.toLocaleString('en-US')} EXP`, 'exp', 0)
          if (e.gold > 0) rewardText(`+${e.gold.toLocaleString('en-US')} gold`, 'gold', -0.35)
          if (e.levelsGained > 0) rewardText('LEVEL UP!', 'level', 0.45)
          break
        case 'reset':
          resetView()
          m.sink = -1
          useFloatingTexts.getState().clear()
          player.current?.revive()
          player.current?.setBase('idle')
          break
      }
    }
    return combatEvents.subscribe(onEvent)
  }, [])

  useFrame((_, delta) => {
    const realDt = Math.min(delta, 0.1)
    const dt = realDt * useGameStore.getState().timeScale
    const events = combatSession.tick(dt)
    if (events.length > 0) combatEvents.emit(events)

    const combat = combatSession.state
    const m = motion.current

    if (combat.phase === 'approach') {
      const t = smoothstep(0, 1, combat.phaseTime / TIMINGS.approach)
      view.player.lerpVectors(m.approachFrom, m.engageAt, t)
    }

    if (m.appear < 1) m.appear = Math.min(1, m.appear + dt / APPEAR_TIME)
    if (m.sink >= 0) {
      m.sink += dt / SINK_TIME
      if (m.sink >= 1) {
        m.sink = -1
        view.monsterVisible = false
      }
    }

    const pg = playerGroup.current
    if (pg) {
      pg.position.copy(view.player)
      const target = combat.phase === 'approach' ? m.engageAt : view.monster
      if (view.monsterVisible && view.player.distanceToSquared(target) > 0.01)
        turn(pg, yawTowards(view.player, target), dt)
    }

    const mg = monsterGroup.current
    if (mg) {
      mg.visible = view.monsterVisible
      const rise = 1 - Math.pow(1 - m.appear, 3)
      const sinkDepth = m.sink >= 0 ? m.sink * m.sink * 1.2 : 0
      mg.position.set(view.monster.x, view.monster.y - sinkDepth, view.monster.z)
      mg.scale.setScalar(0.2 + 0.8 * rise)
      if (combat.phase !== 'victory') turn(mg, yawTowards(view.monster, view.player), dt)
    }

    view.playerHeight = player.current?.height() ?? view.playerHeight
    view.monsterHeight = monster.current?.height() ?? view.monsterHeight

    m.hudTimer -= realDt
    if (m.hudTimer <= 0 || events.length > 0) {
      m.hudTimer = HUD_SYNC_INTERVAL
      useGameStore.getState().syncCombat(combat)
    }
  })

  return (
    <>
      <group ref={playerGroup}>
        <Character key={playerModel} ref={player} modelId={playerModel} />
      </group>
      <group ref={monsterGroup} visible={false}>
        <Suspense fallback={null}>
          <Character
            key={`${monsterModel}:${monsterDef.scale ?? 1}`}
            ref={monster}
            modelId={monsterModel}
            scale={monsterDef.scale ?? 1}
          />
        </Suspense>
      </group>
      <HpBar3D
        color="#62c04a"
        read={() => {
          const c = combatSession.state
          return {
            x: view.player.x,
            y: view.playerHeight + 0.22,
            z: view.player.z,
            ratio: c.player.hp / c.player.stats.maxHp,
            visible: c.phase !== 'defeat',
          }
        }}
      />
      <HpBar3D
        color="#d8392b"
        read={() => {
          const c = combatSession.state
          return {
            x: view.monster.x,
            y: view.monsterHeight * (motion.current.appear || 0) + 0.22,
            z: view.monster.z,
            ratio: c.monster.hp / c.monster.stats.maxHp,
            visible: view.monsterVisible && c.monster.hp > 0 && motion.current.sink < 0,
          }
        }}
      />
      <DamageNumbers />
    </>
  )
}
