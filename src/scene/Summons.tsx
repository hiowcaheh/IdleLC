import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useState, type RefObject } from 'react'
import { Vector3, type Group } from 'three'
import type { Summon } from '../game/logic/combat.ts'
import { ELEMENTAL_MODELS, elementalRange, type ElementalType } from '../game/logic/summons.ts'
import { combatSession } from '../game/session/combatSession.ts'
import { combatEvents } from '../state/combatEvents.ts'
import { useFloatingTexts } from '../state/floatingTexts.ts'
import { useGameStore } from '../state/gameStore.ts'
import { Character, type BaseAnimation, type CharacterHandle } from './Character.tsx'
import { HpBar3D } from './HpBar3D.tsx'
import { ModelBoundary } from './ModelBoundary.tsx'
import { SCREEN_AHEAD, SCREEN_RIGHT, view } from './viewState.ts'

/** ELEMENTAL_RUN_SPEED: metres a second an elemental keeps up with. */
const RUN_SPEED = 8
const TURN_SPEED = 8
/** How long a fallen elemental lies before it disappears (seconds). */
const FALL_TIME = 1.6
const UP = new Vector3(0, 1, 0)

const isAway = () => useGameStore.getState().character?.expedition != null
const present = () => (combatSession.state.player.summons ?? []).map((x) => x.element)
const summonOf = (element: ElementalType): Summon | undefined =>
  combatSession.state.player.summons?.find((x) => x.element === element)

/** Fire and earth keep to the hero's left, wind and water to its right. */
const sideOf = (element: ElementalType) => (element === 0 || element === 2 ? -1 : 1)

interface Shown {
  element: ElementalType
  /** Seconds left of its fall (null: standing). */
  falling: number | null
}

/**
 * The Sorcerer's elementals in the scene: the client's models (CSlaveInfo), at the hero's side
 * while it runs and around the monster at their range while they fight (the server puts them 2 to
 * 5 m from the summoner; where they stand is drawn, not simulated).
 */
export function Summons() {
  const [shown, setShown] = useState<Shown[]>(() =>
    present().map((element) => ({ element, falling: null })),
  )
  const handles = useRef(new Map<ElementalType, RefObject<CharacterHandle | null>>())
  const handle = (element: ElementalType) => handles.current.get(element)?.current

  useEffect(
    () =>
      combatEvents.subscribe((e) => {
        switch (e.type) {
          case 'summon':
            setShown((list) => [
              ...list.filter((x) => x.element !== e.element),
              { element: e.element, falling: null },
            ])
            break
          case 'summonAttack':
            handle(e.element)?.attack()
            break
          case 'summonHit': {
            handle(e.element)?.hit(e.crit)
            const at = view.summons.get(e.element)
            if (at && useGameStore.getState().save.settings.showDamageNumbers)
              useFloatingTexts
                .getState()
                .add(e.crit ? `${e.amount}!` : String(e.amount), 'taken', [at.x, at.y + 1.6, at.z])
            break
          }
          case 'summonMiss': {
            const at = view.summons.get(e.element)
            if (at && useGameStore.getState().save.settings.showDamageNumbers)
              useFloatingTexts.getState().add('Miss', 'miss', [at.x, at.y + 1.6, at.z])
            break
          }
          case 'summonGone':
            if (e.died) {
              handle(e.element)?.die()
              setShown((list) =>
                list.map((x) => (x.element === e.element ? { ...x, falling: FALL_TIME } : x)),
              )
            } else {
              setShown((list) => list.filter((x) => x.element !== e.element))
            }
            break
          case 'reset':
            setShown(present().map((element) => ({ element, falling: null })))
            break
        }
      }),
    [],
  )

  const fallen = (element: ElementalType) =>
    setShown((list) => list.filter((x) => x.element !== element || x.falling === null))

  return (
    <>
      {shown.map(({ element, falling }) => (
        <Elemental
          key={element}
          element={element}
          falling={falling}
          onFallen={() => fallen(element)}
          onHandle={(ref) => {
            if (ref) handles.current.set(element, ref)
            else handles.current.delete(element)
          }}
        />
      ))}
    </>
  )
}

function Elemental({
  element,
  falling,
  onFallen,
  onHandle,
}: {
  element: ElementalType
  falling: number | null
  onFallen(): void
  onHandle(ref: RefObject<CharacterHandle | null> | null): void
}) {
  const group = useRef<Group>(null)
  const character = useRef<CharacterHandle>(null)
  const state = useRef({
    position: new Vector3(),
    placed: false,
    base: 'idle' as BaseAnimation,
    fall: falling,
  })
  useEffect(() => {
    state.current.fall = falling
  }, [falling])
  useEffect(() => {
    onHandle(character)
    return () => onHandle(null)
    // registered once per elemental; the ref is read when an event arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const at = state.current.position
    view.summons.set(element, at)
    return () => {
      if (view.summons.get(element) === at) view.summons.delete(element)
    }
  }, [element])

  const desired = useRef(new Vector3())
  const toward = useRef(new Vector3())
  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    g.visible = !isAway()
    const dt = Math.min(delta, 0.1) * useGameStore.getState().timeScale
    const s = state.current
    if (s.fall !== null) {
      s.fall -= dt
      if (s.fall <= 0) {
        s.fall = null
        onFallen()
      }
      return
    }
    const combat = combatSession.state
    const side = sideOf(element)
    const fighting =
      (combat.phase === 'fighting' || combat.phase === 'approach') && view.monsterVisible
    const target = desired.current
    if (fighting) {
      // around the monster at its range, on its own side of the hero's line
      const away = toward.current.subVectors(view.player, view.monster).setY(0)
      if (away.lengthSq() < 1e-4) away.copy(SCREEN_RIGHT)
      away.normalize().applyAxisAngle(UP, side * 0.9)
      target.copy(view.monster).addScaledVector(away, Math.min(6, elementalRange(element) + 0.6))
    } else {
      // a little behind the hero and to one side
      target
        .copy(view.player)
        .addScaledVector(SCREEN_RIGHT, side * 1.5)
        .addScaledVector(SCREEN_AHEAD, -0.6)
    }
    if (!s.placed) {
      s.position.copy(target)
      s.placed = true
    }
    const gap = toward.current.subVectors(target, s.position).setY(0)
    const distance = gap.length()
    const step = Math.min(distance, RUN_SPEED * dt)
    if (step > 0) s.position.addScaledVector(gap.normalize(), step)
    s.position.y = view.groundY(s.position.x, s.position.z)
    g.position.copy(s.position)

    const running = combat.phase === 'traveling' || distance > 0.3
    const base: BaseAnimation = running ? 'run' : 'idle'
    if (base !== s.base) {
      s.base = base
      character.current?.setBase(base)
    }
    const yaw =
      combat.phase === 'traveling'
        ? view.travelYaw
        : fighting
          ? Math.atan2(view.monster.x - s.position.x, view.monster.z - s.position.z)
          : distance > 0.05
            ? Math.atan2(gap.x, gap.z)
            : g.rotation.y
    let diff = yaw - g.rotation.y
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    g.rotation.y += diff * Math.min(1, dt * TURN_SPEED)
  })

  const bar = () => {
    const summon = summonOf(element)
    const s = state.current
    return {
      x: s.position.x,
      y: s.position.y + (character.current?.height() ?? 1.4) + 0.2,
      z: s.position.z,
      ratio: summon ? summon.hp / summon.stats.maxHp : 0,
      visible: summon !== undefined && s.fall === null && !isAway(),
    }
  }

  return (
    <>
      <group ref={group}>
        <ModelBoundary resetKey={ELEMENTAL_MODELS[element]}>
          <Suspense fallback={null}>
            <Character ref={character} modelId={ELEMENTAL_MODELS[element]} />
          </Suspense>
        </ModelBoundary>
      </group>
      <HpBar3D color="#5fb4e8" read={bar} />
    </>
  )
}
