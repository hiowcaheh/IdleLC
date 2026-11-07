import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import {
  Color,
  DoubleSide,
  Object3D,
  PerspectiveCamera,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Group,
  type InstancedMesh,
} from 'three'
import { gearLooks } from '../game/assets/gear.ts'
import { getModel, modelUrl, playerModelId } from '../game/assets/manifest.ts'
import { getDungeon, DUNGEON_RADIUS, type DungeonId } from '../game/data/dungeons.ts'
import { getMonster } from '../game/data/monsters.ts'
import { getItem } from '../game/data/items.ts'
import { effectiveStats } from '../game/logic/combat.ts'
import { ELEMENTAL_MODELS, type ElementalType } from '../game/logic/summons.ts'
import { wornTitle } from '../game/logic/titles.ts'
import { dungeonSession } from '../game/session/dungeonSession.ts'
import { useGameStore } from '../state/gameStore.ts'
import type { ViewEvent } from '../state/combatEvents.ts'
import { useFloatingTexts } from '../state/floatingTexts.ts'
import { Character, type CharacterHandle } from './Character.tsx'
import { DamageNumbers } from './DamageNumbers.tsx'
import { DungeonBoxes } from './DungeonBoxes.tsx'
import { ClientFxLayer } from './clientFx/ClientFx.tsx'
import { castClientSkill } from './clientFx/skillFx.ts'
import { activeArtifactVisual } from './artifactEffects.ts'
import { HpBar3D } from './HpBar3D.tsx'
import { placeLabel, type SceneLabelId } from './labelAnchors.ts'
import { SkillEffects } from './SkillEffects.tsx'
import { armorUpgradePlus } from './upgradeEffects.ts'
import { view } from './viewState.ts'

const cameraTarget = new Vector3()
const cameraAt = new Vector3()
const crystalMatrix = new Object3D()
const labelPoint = new Vector3()
const dungeonPace = () =>
  dungeonSession.paused ||
  dungeonSession.menuOpen ||
  !dungeonSession.ready ||
  dungeonSession.state?.choices.length ||
  document.hidden
    ? 0
    : useGameStore.getState().timeScale

const fxEvents = {
  subscribe(listener: (e: ViewEvent) => void) {
    return dungeonSession.subscribe((events) => {
      for (const { enemyUid, event } of events) {
        const run = dungeonSession.state
        const enemy = run?.enemies.find((e) => e.uid === enemyUid)
        if (run) view.player.set(run.position.x, 0, run.position.z)
        if (enemy) view.monster.set(enemy.x, 0, enemy.z)
        listener(event)
      }
    })
  },
}

/** Original actors and masonry in an arena for IdleLC's new horde rules (not the WLD floor plan). */
export function DungeonScene({ id }: { id: DungeonId }) {
  const def = getDungeon(id)!
  const character = useGameStore((s) => s.character)!
  const titleEffect = useGameStore((s) =>
    s.character ? wornTitle(s.character, Date.now())?.effect : undefined,
  )
  const roster = useMemo(
    () => def.monsterIds.map((m) => modelUrl(getModel(getMonster(m).modelId))),
    [def],
  )
  useGLTF(roster)
  const [floor, wall] = useTexture([
    `${import.meta.env.BASE_URL}dungeons/${id}/floor.webp`,
    `${import.meta.env.BASE_URL}dungeons/${id}/wall.webp`,
  ])
  useMemo(() => {
    for (const t of [floor!, wall!]) {
      t.colorSpace = SRGBColorSpace
      t.wrapS = t.wrapT = RepeatWrapping
    }
    floor!.repeat.set(24, 24)
    wall!.repeat.set(20, 2)
  }, [floor, wall])
  useEffect(() => {
    dungeonSession.ready = true
    return () => {
      dungeonSession.ready = false
    }
  }, [id])
  const run = useGameStore((s) => s.dungeon)
  const gear = useMemo(
    () => gearLooks(Object.values(character.equipment).map((p) => p.itemId)),
    [character.equipment],
  )
  const hero = useRef<CharacterHandle>(null)
  const playerGroup = useRef<Group>(null)
  const enemyHandles = useRef(new Map<number, CharacterHandle>())
  const enemyGroups = useRef(new Map<number, Group>())
  const summonHandles = useRef(new Map<ElementalType, CharacterHandle>())
  const summonGroups = useRef(new Map<ElementalType, Group>())
  const crystals = useRef<InstancedMesh>(null)
  const cameraPlaced = useRef(false)
  const heroMoving = useRef(false)

  useEffect(
    () =>
      dungeonSession.subscribe((events) => {
        for (const { enemyUid, event: e } of events) {
          const monster = enemyUid === null ? undefined : enemyHandles.current.get(enemyUid)
          // a hero who runs with the stick keeps running: it shoots without its swing clip
          // (owner's report: the Healer floated across the floor in her bow pose)
          const runningHero =
            e.type !== 'death' && 'source' in e && e.source === 'player' && heroMoving.current
          if (e.type === 'attack') {
            if (!runningHero) (e.source === 'player' ? hero.current : monster)?.attack()
          } else if (e.type === 'cast') {
            // the client's effect groups of the skill, between the caster and its target
            const targetUid = dungeonSession.state?.targetUid
            const enemy = () =>
              enemyUid !== null
                ? enemyHandles.current.get(enemyUid)
                : targetUid !== null && targetUid !== undefined
                  ? enemyHandles.current.get(targetUid)
                  : undefined
            castClientSkill(
              e.skillId,
              () => (e.source === 'player' ? hero.current : enemy()),
              () => (e.source === 'player' ? enemy() : hero.current),
              { windUp: e.windUp, landsIn: e.castTime },
            )
            const actor = e.source === 'player' ? (runningHero ? null : hero.current) : monster
            if (
              actor &&
              !actor.skill(e.skillId, {
                windUp: e.windUp,
                landsIn: e.castTime,
                releaseTime: e.releaseTime,
              })
            )
              actor.attack()
          } else if (e.type === 'hit') (e.target === 'player' ? hero.current : monster)?.hit(e.crit)
          else if (e.type === 'death') (e.who === 'player' ? hero.current : monster)?.die()
          else if (e.type === 'summonAttack') summonHandles.current.get(e.element)?.attack()
          else if (e.type === 'summonHit') summonHandles.current.get(e.element)?.hit(e.crit)
          else if (e.type === 'potion') {
            // the potion's name over the hero, so a drink is seen in the crowd: always in a run,
            // since an automatic drink is otherwise easy to miss (owner's report, 2026-11-06)
            const height = hero.current?.height() ?? 2
            useFloatingTexts
              .getState()
              .add(e.name, e.kind === 'hp' || e.kind === 'hpRegen' ? 'heal' : 'mana', [
                view.player.x,
                height + 0.6,
                view.player.z,
              ])
          }
        }
      }),
    [],
  )
  // texts of the field (or an earlier run) do not float over the arena
  useEffect(() => {
    useFloatingTexts.getState().clear()
    return () => useFloatingTexts.getState().clear()
  }, [])

  useFrame(({ camera, size }, delta) => {
    const s = dungeonSession.state
    const group = playerGroup.current
    if (!s || !group) return
    const previous = dungeonSession.previous
    const t =
      dungeonPace() === 0
        ? 1
        : Math.min(
            1,
            (performance.now() - dungeonSession.updatedAt) / (dungeonSession.interval * 1000),
          )
    const from = previous?.id === s.id ? previous.position : s.position
    const x = from.x + (s.position.x - from.x) * t,
      z = from.z + (s.position.z - from.z) * t
    group.position.set(x, 0, z)
    let yaw = s.facing
    const target = s.enemies.find((e) => e.uid === s.targetUid)
    const moving = Math.hypot(s.position.x - from.x, s.position.z - from.z) > 0.001
    if (!moving && target) yaw = Math.atan2(target.x - x, target.z - z)
    const turn = Math.atan2(Math.sin(yaw - group.rotation.y), Math.cos(yaw - group.rotation.y))
    group.rotation.y += turn * Math.min(1, delta * 12)
    heroMoving.current = moving
    hero.current?.setBase(moving ? 'run' : 'idle', moving)
    view.player.copy(group.position)
    view.playerHeight = hero.current?.height() ?? 2
    if (target) view.monster.set(target.x, 0, target.z)
    view.monsterHeight = target ? (enemyHandles.current.get(target.uid)?.height() ?? 2) : 2

    for (const e of s.enemies) {
      const g = enemyGroups.current.get(e.uid)
      if (!g) continue
      const p = previous?.enemies.find((p) => p.uid === e.uid) ?? e
      g.position.set(
        p.x + (e.x - p.x) * t,
        e.deadFor < 0 ? 0 : -e.deadFor * 0.6,
        p.z + (e.z - p.z) * t,
      )
      g.rotation.y = Math.atan2(x - g.position.x, z - g.position.z)
      const model = enemyHandles.current.get(e.uid)
      if (e.fighter.hp <= 0) model?.die()
      else model?.setBase(Math.hypot(e.x - p.x, e.z - p.z) > 0.001 ? 'run' : 'idle')
    }
    for (const [element, g] of summonGroups.current) {
      const side = element === 0 || element === 2 ? -1 : 1
      g.position.set(x + side * 2.1, 0, z + 1.8)
      g.rotation.y = target ? Math.atan2(target.x - g.position.x, target.z - g.position.z) : yaw
      summonHandles.current.get(element)?.setBase(moving ? 'run' : 'idle')
    }
    const mesh = crystals.current
    if (mesh) {
      mesh.count = Math.min(512, s.crystals.length)
      for (let i = 0; i < mesh.count; i++) {
        const c = s.crystals[i]!
        crystalMatrix.position.set(c.x, 0.25 + Math.sin(s.elapsed * 3 + c.uid) * 0.07, c.z)
        crystalMatrix.rotation.set(0, s.elapsed + c.uid, 0)
        crystalMatrix.scale.setScalar(Math.min(0.3, 0.15 + c.value * 0.02))
        crystalMatrix.updateMatrix()
        mesh.setMatrixAt(i, crystalMatrix.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    }
    cameraTarget.set(x, 1, z - 1)
    cameraAt.set(x, 13.5, z + 14)
    if (!cameraPlaced.current) {
      // The field camera uses map coordinates and a portrait view offset. Start here at once.
      if (camera instanceof PerspectiveCamera) camera.clearViewOffset()
      camera.position.copy(cameraAt)
      cameraPlaced.current = true
    } else camera.position.lerp(cameraAt, 1 - Math.exp(-delta * 8))
    camera.lookAt(cameraTarget)

    // the hero's name plate and title, and "Lv N Name" over the target, as on the field
    // (ui/hud/SceneLabels.tsx), projected with the camera as it is now
    camera.updateMatrixWorld()
    const place = (id: SceneLabelId, px: number, py: number, pz: number, shown: boolean) => {
      const p = labelPoint.set(px, py, pz).project(camera)
      placeLabel(id, ((p.x + 1) / 2) * size.width, ((1 - p.y) / 2) * size.height, shown && p.z < 1)
    }
    place('player', x, view.playerHeight + 0.2, z, true)
    const aim = target && target.fighter.hp > 0 ? enemyGroups.current.get(target.uid) : undefined
    place('monster', aim?.position.x ?? 0, view.monsterHeight + 0.1, aim?.position.z ?? 0, !!aim)
  })

  const weapon = character.equipment.weapon
  const weaponSubtype = weapon ? getItem(weapon.itemId).gear?.subtype : undefined
  return (
    <>
      <color attach="background" args={['#12151a']} />
      <fog attach="fog" args={['#12151a', 26, 65]} />
      <hemisphereLight args={['#c6d5de', '#30241c', 2]} />
      <directionalLight position={[6, 14, 10]} intensity={2.4} color="#ffe0b3" />
      <pointLight position={[0, 5, 0]} intensity={30} distance={45} color={def.color} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[DUNGEON_RADIUS + 1, 64]} />
        <meshStandardMaterial map={floor} color="#999da3" roughness={1} />
      </mesh>
      <mesh position-y={2.8}>
        <cylinderGeometry args={[DUNGEON_RADIUS + 1, DUNGEON_RADIUS + 1, 5.6, 64, 1, true]} />
        <meshStandardMaterial map={wall} roughness={1} side={DoubleSide} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (i * Math.PI) / 6
        return (
          <group key={i} position={[Math.sin(angle) * 28.8, 0, Math.cos(angle) * 28.8]}>
            <mesh position-y={3}>
              <cylinderGeometry args={[0.65, 0.8, 6, 8]} />
              <meshStandardMaterial map={wall} roughness={1} />
            </mesh>
            <mesh position-y={3.8}>
              <octahedronGeometry args={[0.18]} />
              <meshBasicMaterial color={def.color} />
            </mesh>
          </group>
        )
      })}
      <DamageNumbers />
      <ClientFxLayer pace={dungeonPace} />
      <group ref={playerGroup}>
        <Character
          ref={hero}
          modelId={playerModelId(character.classId)}
          timeScale={dungeonPace}
          gear={gear}
          upgrades={{
            classId: character.classId,
            weaponPlus: weapon?.plus ?? 0,
            armorPlus: armorUpgradePlus(character.equipment),
            weaponSubtype,
          }}
          titleEffect={titleEffect}
          artifactEffect={activeArtifactVisual(run?.player.effects ?? [])}
        />
      </group>
      {run?.enemies.map((e) => (
        <group
          key={e.uid}
          ref={(g) => {
            if (g) enemyGroups.current.set(e.uid, g)
            else enemyGroups.current.delete(e.uid)
          }}
          position={[e.x, 0, e.z]}
        >
          <Character
            ref={(handle) => {
              if (handle) enemyHandles.current.set(e.uid, handle)
              else enemyHandles.current.delete(e.uid)
            }}
            modelId={getMonster(e.monsterId).modelId}
            scale={getMonster(e.monsterId).scale}
            timeScale={dungeonPace}
          />
        </group>
      ))}
      {(run?.player.summons ?? []).map((summon) => (
        <group
          key={summon.element}
          ref={(g) => {
            if (g) summonGroups.current.set(summon.element, g)
            else summonGroups.current.delete(summon.element)
          }}
        >
          <Suspense fallback={null}>
            <Character
              modelId={ELEMENTAL_MODELS[summon.element]}
              timeScale={dungeonPace}
              ref={(h) => {
                if (h) summonHandles.current.set(summon.element, h)
                else summonHandles.current.delete(summon.element)
              }}
            />
          </Suspense>
        </group>
      ))}
      <Suspense fallback={null}>
        <DungeonBoxes boxes={run?.boxes ?? []} />
      </Suspense>
      <instancedMesh ref={crystals} args={[undefined, undefined, 512]} frustumCulled={false}>
        <octahedronGeometry args={[1]} />
        <meshStandardMaterial
          color="#9ceaff"
          emissive={new Color('#277a9f')}
          emissiveIntensity={1.4}
          roughness={0.3}
        />
      </instancedMesh>
      <HpBar3D
        color="#63cb82"
        read={() => {
          const s = dungeonSession.state
          return {
            x: view.player.x,
            y: view.playerHeight + 0.2,
            z: view.player.z,
            ratio: s ? s.player.hp / effectiveStats(s.player).maxHp : 1,
            visible: !!s,
          }
        }}
      />
      <HpBar3D
        color="#d85f51"
        read={() => {
          const s = dungeonSession.state
          const e = s?.enemies.find((e) => e.uid === s.targetUid)
          return {
            x: e?.x ?? 0,
            y: view.monsterHeight + 0.1,
            z: e?.z ?? 0,
            ratio: e ? e.fighter.hp / e.fighter.stats.maxHp : 1,
            visible: !!e && e.fighter.hp > 0,
          }
        }}
      />
      <SkillEffects events={fxEvents} pace={dungeonPace} />
    </>
  )
}
