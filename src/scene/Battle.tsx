import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Vector3, type Group } from 'three'
import { gearLooks } from '../game/assets/gear.ts'
import { getModel, playerModelId } from '../game/assets/manifest.ts'
import { getMonster } from '../game/data/monsters.ts'
import { getItem } from '../game/data/items.ts'
import { TIMINGS, effectiveStats, isStunned, runSpeed, type Side } from '../game/logic/combat.ts'
import { wornTitle } from '../game/logic/titles.ts'
import { combatSession } from '../game/session/combatSession.ts'
import { VisibleClock } from '../game/session/visibleClock.ts'
import { combatEvents, type ViewEvent } from '../state/combatEvents.ts'
import { useFloatingTexts, type FloatingKind } from '../state/floatingTexts.ts'
import { useGameStore } from '../state/gameStore.ts'
import { Character, type CharacterHandle } from './Character.tsx'
import { DamageNumbers } from './DamageNumbers.tsx'
import { ClientFxLayer } from './clientFx/ClientFx.tsx'
import { castClientSkill } from './clientFx/skillFx.ts'
import { HpBar3D } from './HpBar3D.tsx'
import { LevelUpEffect } from './LevelUpEffect.tsx'
import { ModelBoundary } from './ModelBoundary.tsx'
import { placeLabel, type SceneLabelId } from './labelAnchors.ts'
import { SkillEffects } from './SkillEffects.tsx'
import { armorUpgradePlus } from './upgradeEffects.ts'
import { approachProgress } from './approachMotion.ts'
import { ARENA_RADIUS } from './terrain.ts'
import { RunSmoke } from './RunSmoke.tsx'
import { Summons } from './Summons.tsx'
import { SCREEN_AHEAD, SCREEN_RIGHT, resetView, view } from './viewState.ts'

/** How far the player runs to reach a newly spawned monster. */
const RUN_DISTANCE = 3.8
const APPEAR_TIME = 0.45
/** The fallen monster sinks into the ground before the next one comes (TIMINGS.spawning). */
const SINK_TIME = 0.5
const TURN_SPEED = 10
const HUD_SYNC_INTERVAL = 0.1

const UP = new Vector3(0, 1, 0)
const ORIGIN = new Vector3()

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

/** Floating texts over one fighter within this many ms stack in rows (up to TEXT_ROWS). */
const TEXT_STACK_MS = 600
const TEXT_ROWS = 4
const TEXT_ROW_HEIGHT = 0.3

/** Height of the HP bars over the heads (world units); names and curses sit on them (CSS offsets). */
const BAR_LIFT = 0.22

/** The played character is away on an AFK expedition: no fight on screen. */
const isAway = () => {
  const s = useGameStore.getState()
  return (
    s.character?.expedition != null ||
    s.dungeon != null ||
    s.dungeonEntering ||
    s.worldBossEntering ||
    s.dungeonResult != null
  )
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
  const clock = useRef(new VisibleClock())
  useEffect(() => {
    const sync = () => clock.current.visibility(!document.hidden, performance.now())
    clock.current.reset(performance.now())
    sync()
    document.addEventListener('visibilitychange', sync)
    const unsubscribe = useGameStore.subscribe((next, previous) => {
      if (next.worldBossResult !== previous.worldBossResult) clock.current.reset(performance.now())
    })
    return () => {
      document.removeEventListener('visibilitychange', sync)
      unsubscribe()
    }
  }, [])
  const monsterId = useGameStore((s) => s.hud.monsterId)
  const monsterDef = getMonster(monsterId)
  const monsterModel = monsterDef.modelId
  const worldBoss = useGameStore(
    (s) => s.character?.worldBoss?.active?.monsterId === s.hud.monsterId,
  )
  const showNumbers = useGameStore((s) => s.save.settings.showDamageNumbers)
  const classId = useGameStore((s) => s.character?.classId ?? 'knight')
  const equipment = useGameStore((s) => s.character?.equipment)
  const titleEffect = useGameStore((s) =>
    s.character ? wornTitle(s.character, Date.now())?.effect : undefined,
  )
  const playerModel = playerModelId(classId)
  const gear = useMemo(
    () => gearLooks(Object.values(equipment ?? {}).map((piece) => piece.itemId)),
    [equipment],
  )
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
    /** A monster running in at a hero who shoots from range: its way to the hero and stop distance. */
    closeDir: new Vector3(),
    closeStop: 0,
    closing: false,
    appear: 1,
    sink: -1,
    hudTimer: 0,
    /** Game seconds until a fighter swings for a skill being cast (-1: none). */
    swingIn: { player: -1, monster: -1 } as Record<Side, number>,
  })
  const showNumbersRef = useRef(showNumbers)
  useEffect(() => {
    showNumbersRef.current = showNumbers
  }, [showNumbers])

  /** Where the HP bars go each frame (the labels sit around them). */
  const playerBar = () => {
    const c = combatSession.state
    return {
      x: view.player.x,
      y: view.player.y + view.playerHeight + BAR_LIFT,
      z: view.player.z,
      ratio: c.player.hp / effectiveStats(c.player).maxHp,
      visible: c.phase !== 'defeat' && !isAway(),
    }
  }
  const monsterBar = () => {
    const c = combatSession.state
    return {
      x: view.monster.x,
      y: view.monster.y + view.monsterHeight * (motion.current.appear || 0) + BAR_LIFT,
      z: view.monster.z,
      ratio: c.monster.hp / c.monster.stats.maxHp,
      pixels: worldBoss ? 72 : undefined,
      visible: view.monsterVisible && c.monster.hp > 0 && motion.current.sink < 0 && !isAway(),
    }
  }

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
      if (combat.phase === 'fighting' && combat.closing !== undefined) {
        // mid-way through a monster's run at a hero who shoots from range
        const m = motion.current
        view.player.set(0, 0, 0)
        m.closeDir.copy(SCREEN_AHEAD).applyAxisAngle(UP, 0.5)
        m.closeStop = engage
        m.closing = true
      }
    }
  }, [])

  useEffect(() => {
    // texts over the same fighter close together in time take the next row up, so they don't overlap
    const recent: Record<Side, number[]> = { player: [], monster: [] }
    const textAt = (side: Side, text: string, kind: FloatingKind) => {
      if (!showNumbersRef.current) return
      const pos = side === 'player' ? view.player : view.monster
      const handle = side === 'player' ? player.current : monster.current
      const height = handle?.height() ?? 1.8
      const now = performance.now()
      recent[side] = [...recent[side].filter((t) => now - t < TEXT_STACK_MS), now]
      const row = (recent[side].length - 1) % TEXT_ROWS
      const lift =
        row * TEXT_ROW_HEIGHT + (kind === 'skill' || kind === 'effect' ? TEXT_ROW_HEIGHT : 0)
      const jitter = (Math.random() - 0.5) * 0.3
      useFloatingTexts.getState().add(text, kind, [pos.x + jitter, height + 0.45 + lift, pos.z])
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
          if (e.gap) {
            // a hero who shoots from range stays put; the monster appears at the hero's reach,
            // ahead of the camera and to one side, and runs in while the hero already shoots
            const engage = engageDistance(combatSession.state.monsterId, playerModelRef.current)
            const side = Math.random() < 0.5 ? -1 : 1
            m.closeDir.copy(SCREEN_AHEAD).applyAxisAngle(UP, side * (0.35 + Math.random() * 0.3))
            m.closeStop = engage
            m.closing = true
            view.monster.copy(view.player).addScaledVector(m.closeDir, engage + e.gap)
            view.monster.y = view.groundY(view.monster.x, view.monster.z)
            monsterGroup.current?.rotation.set(0, yawTowards(view.monster, view.player), 0)
            monster.current?.setBase('run')
          } else {
            view.player.copy(m.engageAt)
          }
          player.current?.setBase('idle')
          break
        case 'attack':
          ;(e.source === 'player' ? player : monster).current?.attack()
          break
        case 'cast':
          textAt(e.source, e.name, 'skill')
          // the skill's own effect groups from the client, on the fighters' tags
          castClientSkill(
            e.skillId,
            () => (e.source === 'player' ? player : monster).current,
            () => (e.source === 'player' ? monster : player).current,
            { windUp: e.windUp, landsIn: e.castTime },
          )
          // the skill's own clips from the client, else a swing timed to land with the skill
          if (
            e.source === 'player' &&
            player.current?.skill(e.skillId, {
              windUp: e.windUp,
              landsIn: e.castTime,
              releaseTime: e.releaseTime,
            })
          )
            break
          if (e.kind === 'attack' || e.kind === 'debuff') {
            m.swingIn[e.source] = Math.max(0, e.castTime - TIMINGS.impactDelay)
          }
          break
        case 'hit':
          if (e.poison) {
            textAt(e.target, String(e.amount), 'poison')
            break
          }
          ;(e.target === 'player' ? player : monster).current?.hit(e.crit)
          textAt(
            e.target,
            e.deadly ? `${e.amount}!!` : e.crit ? `${e.amount}!` : String(e.amount),
            e.target === 'player' ? 'taken' : e.crit || e.deadly ? 'crit' : 'dealt',
          )
          break
        case 'heal':
          if (e.amount > 0) textAt(e.target, `+${e.amount}`, e.mana ? 'mana' : 'heal')
          break
        case 'potion':
          textAt('player', e.name, e.kind === 'hp' || e.kind === 'hpRegen' ? 'heal' : 'mana')
          break
        case 'effect':
          if (e.kind === 'stun') textAt(e.target, 'Stunned', 'effect')
          else if (e.kind === 'poison') textAt(e.target, 'Poisoned', 'effect')
          else if (e.kind === 'debuff') textAt(e.target, e.name, 'effect')
          break
        case 'miss':
          textAt(e.target, 'Miss', 'miss')
          break
        case 'interrupt':
          // the cancelled skill's swing is not played
          m.swingIn[e.target] = -1
          textAt(e.target, 'Cancelled', 'effect')
          break
        case 'death':
          m.swingIn = { player: -1, monster: -1 }
          if (e.who === 'monster') {
            // the hero stays in its fighting stance and goes on to the next monster
            monster.current?.die()
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
        case 'travel':
          // the monster stays behind at once (the next one spawns at the new spot)
          view.monsterVisible = false
          m.sink = -1
          player.current?.setBase('run')
          break
        case 'arrive':
          player.current?.setBase('idle')
          break
        case 'reset':
          clock.current.reset(performance.now())
          resetView()
          m.sink = -1
          m.swingIn = { player: -1, monster: -1 }
          useFloatingTexts.getState().clear()
          player.current?.revive()
          player.current?.setBase('idle')
          break
      }
    }
    return combatEvents.subscribe(onEvent)
  }, [])

  useFrame((_, delta) => {
    if (useGameStore.getState().worldBossResult) {
      clock.current.reset(performance.now())
      return
    }
    const away = isAway()
    if (playerGroup.current) playerGroup.current.visible = !away
    if (away) {
      clock.current.reset(performance.now())
      if (monsterGroup.current) monsterGroup.current.visible = false
      return
    }
    const realDt = Math.min(delta, 0.1)
    const timeScale = useGameStore.getState().timeScale
    const dt = clock.current.read(performance.now()) * timeScale
    const events = combatSession.tick(dt, timeScale !== 1)
    if (events.length > 0) combatEvents.emit(events)

    const combat = combatSession.state
    const m = motion.current
    view.interpolationSeconds = clock.current.interpolationSeconds * timeScale

    if (combat.phase === 'traveling') {
      // the hero runs on the spot (the ground moves under it), back at the arena's centre
      view.player.lerp(ORIGIN, Math.min(1, realDt * 3))
    }

    if (combat.phase === 'approach') {
      const t = approachProgress(combat, clock.current.interpolationSeconds, timeScale)
      view.player.lerpVectors(m.approachFrom, m.engageAt, t)
    }

    if (m.closing) {
      // the monster running in at a hero who shoots from range, drawn between logic steps
      const running = combat.phase === 'fighting' && combat.closing !== undefined
      const held =
        isStunned(combat.monster) || combat.monster.effects.some((e) => e.state === 'hold')
      const ahead = held ? 0 : view.interpolationSeconds * runSpeed(effectiveStats(combat.monster))
      const left = running ? Math.max(0, combat.closing! - ahead) : 0
      view.monster.copy(view.player).addScaledVector(m.closeDir, m.closeStop + left)
      view.monster.y = view.groundY(view.monster.x, view.monster.z)
      if (!running) {
        m.closing = false
        if (combat.phase === 'fighting') monster.current?.setBase('idle')
      }
    }

    for (const side of ['player', 'monster'] as const) {
      if (m.swingIn[side] < 0) continue
      m.swingIn[side] -= dt
      if (m.swingIn[side] <= 0) {
        m.swingIn[side] = -1
        ;(side === 'player' ? player : monster).current?.attack()
      }
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
      if (combat.phase === 'traveling') turn(pg, view.travelYaw, realDt)
      else if (view.monsterVisible && view.player.distanceToSquared(target) > 0.01)
        turn(pg, yawTowards(view.player, target), realDt * timeScale)
    }

    const mg = monsterGroup.current
    if (mg) {
      mg.visible = view.monsterVisible
      const rise = 1 - Math.pow(1 - m.appear, 3)
      const sinkDepth = m.sink >= 0 ? m.sink * m.sink * 1.2 : 0
      mg.position.set(view.monster.x, view.monster.y - sinkDepth, view.monster.z)
      mg.scale.setScalar(0.2 + 0.8 * rise)
      // it faces the one it swings at: the hero, or an elemental it hates more
      const aim = combat.monster.aimAt
      const faced = (aim !== undefined && view.summons.get(aim)) || view.player
      if (combat.phase !== 'victory') turn(mg, yawTowards(view.monster, faced), dt)
    }

    view.playerHeight = player.current?.height() ?? view.playerHeight
    view.monsterHeight = monster.current?.height() ?? view.monsterHeight
    view.monsterFrameHeight = monster.current?.framingHeight() ?? view.monsterHeight

    m.hudTimer -= realDt
    if (m.hudTimer <= 0 || events.length > 0) {
      m.hudTimer = HUD_SYNC_INTERVAL
      useGameStore.getState().syncCombat(combat)
    }
  })

  // the HTML labels (ui/hud/SceneLabels.tsx) follow the HP bars
  const labelPoint = useRef(new Vector3())
  useFrame(({ camera, size }) => {
    // the camera has moved this frame (CameraRig): project with where it is now, not where the last
    // frame drew it, so the labels stay on the bars
    camera.updateMatrixWorld()
    const place = (
      id: SceneLabelId,
      bar: { x: number; y: number; z: number; visible: boolean },
    ) => {
      const p = labelPoint.current.set(bar.x, bar.y, bar.z).project(camera)
      const inView = bar.visible && p.z < 1
      placeLabel(id, ((p.x + 1) / 2) * size.width, ((1 - p.y) / 2) * size.height, inView)
    }
    place('player', playerBar())
    const monsterAt = monsterBar()
    place('monster', monsterAt)
    place('effects', monsterAt)
  })

  return (
    <>
      <group ref={playerGroup}>
        <ModelBoundary resetKey={playerModel}>
          <Character
            key={playerModel}
            ref={player}
            modelId={playerModel}
            gear={gear}
            titleEffect={titleEffect}
            upgrades={{
              classId,
              weaponPlus: equipment?.weapon?.plus ?? 0,
              armorPlus: armorUpgradePlus(equipment ?? {}),
              weaponSubtype: equipment?.weapon
                ? getItem(equipment.weapon.itemId).gear?.subtype
                : undefined,
            }}
          />
        </ModelBoundary>
      </group>
      <group ref={monsterGroup} visible={false}>
        <ModelBoundary resetKey={monsterModel}>
          <Suspense fallback={null}>
            <Character
              key={`${monsterModel}:${monsterDef.scale ?? 1}`}
              ref={monster}
              modelId={monsterModel}
              scale={monsterDef.scale ?? 1}
              trackBounds={worldBoss}
            />
          </Suspense>
        </ModelBoundary>
      </group>
      <HpBar3D color="#62c04a" read={playerBar} />
      <HpBar3D color="#d8392b" read={monsterBar} />
      <DamageNumbers />
      <LevelUpEffect />
      <Suspense fallback={null}>
        <SkillEffects />
        <ClientFxLayer />
      </Suspense>
      <Suspense fallback={null}>
        <RunSmoke />
      </Suspense>
      <Summons />
    </>
  )
}
