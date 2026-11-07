/**
 * Plays the client's own effect groups for skills (skills.lod ready / fire / after effects and the
 * effects the class clips key in their .bae) on the fighters' tags. ClientFxLayer draws them.
 */
import { Object3D, Quaternion, Vector3, type Mesh } from 'three'
import type { CharacterHandle } from '../Character.tsx'
import {
  placeSourceTag,
  weaponAnchorPosition,
  weaponAnchors,
  type WeaponAnchor,
} from '../upgradeEffects.ts'
import { clientFx, type ClientFxData } from './data.ts'
import {
  IDENTITY,
  rotate,
  type Placement,
  type Quat,
  type TagLookup,
  type Vec3,
} from './particles.ts'
import { EffectGroupPlayer } from './player.ts'

/** Something that hands out the live character (its ref changes as models load). */
export type FighterSource = () => CharacterHandle | null | undefined

const holder = new Object3D()
const scratch = new Object3D()
const point = new Vector3()
const turn = new Quaternion()

const toQuat = (q: Quaternion): Quat => [q.w, q.x, q.y, q.z]
const toVec = (v: Vector3): Vec3 => [v.x, v.y, v.z]

/** Share of the model's height a tag stands at when the model has no source tag of that name. */
function fallbackHeight(name: string): number {
  if (/^(HEAD|FACE|EYE|__TOP)/.test(name)) return 0.9
  if (/FOOT/.test(name)) return 0.03
  if (/HAND|SWORD|WAND|STAFF|AXE|DAGGER|BOW|ARROW|SHIELD|WEAPON|CUTTER/.test(name)) return 0.55
  return 0.5
}

/**
 * A character's tags: the source tag vertices of the hero's body and weapons (as the upgrade
 * effects use them); else a point at the share of its height the tag's name suggests.
 */
export function fighterTag(
  fighter: CharacterHandle | null | undefined,
  name: string,
): Placement | null {
  if (!fighter) return null
  const target = fighter.effectTarget()
  // a group tag's own points (__0_SWORD) when the model has them, else the tag itself
  if (/^__\d+_/.test(name) && placeSourceTag(target, name, holder, scratch))
    return { position: toVec(scratch.position), rotation: toQuat(scratch.quaternion) }
  const plain = name.replace(/^__\d+_/, '')
  if (plain !== '__TOP' && placeSourceTag(target, plain, holder, scratch)) {
    return { position: toVec(scratch.position), rotation: toQuat(scratch.quaternion) }
  }
  // a weapon's group tag the item models lack: the ends of the held weapon (own approximation)
  const blade = weaponEnd(fighter, name)
  if (blade) return blade
  target.object.getWorldPosition(point)
  target.object.getWorldQuaternion(turn)
  point.y += fighter.height() * fallbackHeight(plain)
  return { position: toVec(point), rotation: toQuat(turn) }
}

const WEAPON_TAG = /^(?:__(\d)_)?(SWORD|RDAGGER|LDAGGER|AXE|LDSWORD|RDSWORD|DAGGER|WEAPON)$/
const anchorsOf = new WeakMap<Mesh, WeaponAnchor[]>()
const endPoint = new Vector3()
const handPoint = new Vector3()

/**
 * The weapon's tags the client's item models carry as a group (SWORD: two points along the blade)
 * but the converted ones do not: the ends of the weapon in that hand along its longest axis.
 * __1_ is the end at the hand, __0_ (and the plain name) the far one.
 */
function weaponEnd(fighter: CharacterHandle, name: string): Placement | null {
  const match = WEAPON_TAG.exec(name)
  const target = fighter.effectTarget()
  if (!match || !target.weapons.size) return null
  const left = /^L/.test(match[2]!)
  const hand = fighterHand(fighter, left ? 'LHAND' : 'RHAND')
  let best: { mesh: Mesh; ends: Vector3[]; distance: number } | null = null
  for (const mesh of target.weapons) {
    let anchors = anchorsOf.get(mesh)
    if (!anchors) {
      anchors = weaponAnchors(mesh, 12)
      anchorsOf.set(mesh, anchors)
    }
    if (anchors.length < 2) continue
    const ends = [anchors[0]!, anchors[anchors.length - 1]!].map((a) =>
      weaponAnchorPosition(a, holder, new Vector3()),
    )
    const distance = hand ? Math.min(...ends.map((e) => e.distanceTo(hand))) : 0
    if (!best || distance < best.distance) best = { mesh, ends, distance }
  }
  if (!best) return null
  const [a, b] = best.ends as [Vector3, Vector3]
  const nearHand = hand && a.distanceTo(hand) < b.distanceTo(hand) ? a : b
  const far = nearHand === a ? b : a
  endPoint.copy(match[1] === '1' ? nearHand : far)
  best.mesh.getWorldQuaternion(turn)
  return { position: toVec(endPoint), rotation: toQuat(turn) }
}

/** A hand's source tag position (null when the model has none). */
function fighterHand(fighter: CharacterHandle, name: 'LHAND' | 'RHAND'): Vector3 | null {
  return placeSourceTag(fighter.effectTarget(), name, holder, scratch)
    ? handPoint.copy(scratch.position)
    : null
}

interface Pending {
  at: number
  start(): void
}

/** A missile in flight: its effect group rides on it, its hit group plays where it arrives. */
interface Missile {
  position: Vec3
  rotation: Quat
  speed: number
  target: FighterSource
  player: EffectGroupPlayer | null
  hit(): void
}

/** The groups playing now, the ones waiting for their time (game seconds), the missiles flying. */
export const fxState = {
  clock: 0,
  pending: [] as Pending[],
  players: [] as EffectGroupPlayer[],
  missiles: [] as Missile[],
}

/** CSkill missile types that send a missile (MT_ARROW, CONTINUE, INVISIBLE, MAGIC, MAGECUTTER, GOWAITBACK). */
const FLYING = new Set([1, 3, 4, 5, 7, 10])
const FORWARD = new Vector3(0, 0, -1)
/** Metres between a missile's two group points (an arrow's head and nock; own measure). */
const MISSILE_LENGTH = 0.8
const heading = new Vector3()

/**
 * Moves the missiles toward their targets' middles at their speed (the target may move); on
 * arrival the missile's group stops with its fade-outs (CEffectGroup::Stop) and the hit plays.
 */
export function advanceMissiles(dt: number): void {
  fxState.missiles = fxState.missiles.filter((m) => {
    const end = fighterTag(m.target(), 'CENTER')
    if (!end) {
      m.player?.stop()
      return false
    }
    heading.set(
      end.position[0] - m.position[0],
      end.position[1] - m.position[1],
      end.position[2] - m.position[2],
    )
    const distance = heading.length()
    const step = m.speed * dt
    if (distance <= Math.max(step, 0.05)) {
      m.position = end.position
      m.player?.stop()
      m.hit()
      return false
    }
    heading.divideScalar(distance)
    m.position = m.position.map((v, i) => v + heading.getComponent(i) * step) as Vec3
    // the missile entity faces where it flies (its forward is −z)
    m.rotation = toQuat(turn.setFromUnitVectors(FORWARD, heading))
    return true
  })
}

/** Effect kinds this player draws. */
const DRAWN = new Set(['EFPT', 'EFMD', 'EFSK', 'EFSB', 'EFTC', 'EFOB'])

/** Whether a skill has effects of its own in the client data (loaded or not yet). */
export function hasClientSkillFx(skillId: number): boolean {
  const data = clientFx()
  const skill = data?.skills[skillId]
  if (!skill || !data) return false
  return [skill.ready, ...skill.fire, skill.missile, skill.hit, skill.after].some((name) => {
    const group = name ? data.groups[name] : undefined
    // the client draws it with particles, effect models, trails or orbits
    return group?.effects.some((e) => {
      const kind = data.effects[e.name]?.kind
      return !!kind && DRAWN.has(kind)
    })
  })
}

function play(data: ClientFxData, name: string | undefined, tags: TagLookup) {
  if (!name || !data.groups[name]) return null
  const player = new EffectGroupPlayer(name, data, tags)
  fxState.players.push(player)
  return player
}

/**
 * A cast: the ready group at once, the fire group when the release starts, at each of the skill's
 * delays a missile with its group (or the hit at once), the after group on the target when the
 * hit lands, and the effects the clips key at their delays. TEST-HIT is the target's middle;
 * ARROWHEAD on the caster flies from the hand to it over the release.
 */
export function castClientSkill(
  skillId: number,
  caster: FighterSource,
  target: FighterSource,
  timing: { windUp: number; landsIn: number },
): void {
  const data = clientFx()
  const skill = data?.skills[skillId]
  if (!data || !skill) return
  const now = fxState.clock
  const fireAt = now + Math.max(0, timing.windUp)
  const landAt = now + Math.max(timing.windUp, timing.landsIn)
  let launch: Vec3 | null = null
  const casterTags: TagLookup = (name) => {
    if (name === 'TEST-HIT') return fighterTag(target(), 'CENTER')
    if (name === 'ARROWHEAD' || name === 'ARROW') {
      const end = fighterTag(target(), 'CENTER')
      launch ??= fighterTag(caster(), 'RHAND')?.position ?? null
      if (!end || !launch) return end
      const t = Math.min(1, Math.max(0, (fxState.clock - fireAt) / Math.max(0.05, landAt - fireAt)))
      return {
        position: launch.map((v, i) => v + (end.position[i]! - v) * t) as Vec3,
        rotation: end.rotation,
      }
    }
    return fighterTag(caster(), name)
  }
  const targetTags: TagLookup = (name) =>
    fighterTag(target(), name === 'TEST-HIT' ? 'CENTER' : name)
  const at = (time: number, run: () => void) => fxState.pending.push({ at: time, start: run })
  // the ready group ends when the release starts; its SKA models are where a continued missile
  // (MT_CONTINUE) sets off from (Character.es m_saLastEffectInfo, Stop(0.04))
  let ready: EffectGroupPlayer | null = null
  const formed: Vec3[] = []
  at(now, () => (ready = play(data, skill.ready, casterTags)))
  at(fireAt, () => {
    if (!ready) return
    for (const model of ready.skaModels()) formed.push(model.position)
    ready.stop(0.04)
  })
  for (const key of skill.clips?.ready ?? [])
    at(now + key.delay, () => play(data, key.group, casterTags))
  for (const key of skill.clips?.fire ?? [])
    at(fireAt + key.delay, () => play(data, key.group, casterTags))
  for (const name of skill.fire) at(fireAt, () => play(data, name, casterTags))
  // FireEffect2 / FireEffect3 at each of the skill's delays (Character.es SkillFire): a missile
  // from the hand that plays the hit where it arrives, or the hit on the target at once
  const type = skill.projectile?.type ?? 0
  const delays = skill.projectile?.delays.length ? skill.projectile.delays : [0]
  delays.forEach((delay, shot) => {
    if (type === 9) return // MT_NOTHING
    if (FLYING.has(type)) {
      at(fireAt + delay, () => {
        const hand = fighterTag(caster(), 'RHAND') ?? fighterTag(caster(), 'CENTER')
        const continued = type === 3 ? formed[shot] : undefined
        const from = continued ? { position: continued, rotation: IDENTITY } : hand
        if (!from) return
        const missile: Missile = {
          position: from.position,
          rotation: from.rotation,
          speed: Math.max(1, skill.projectile?.speed ?? 30),
          target,
          player: null,
          hit: () => play(data, skill.hit, targetTags),
        }
        // every tag of the missile's group is the missile itself
        // the missile's tags are on it; a group's second point (__1_ARROW) trails behind it
        missile.player = play(data, skill.missile, (name) => ({
          position: name.startsWith('__1_')
            ? (missile.position.map(
                (v, i) => v - rotate([0, 0, -MISSILE_LENGTH], missile.rotation)[i]!,
              ) as Vec3)
            : missile.position,
          rotation: missile.rotation,
        }))
        fxState.missiles.push(missile)
      })
    } else at(fireAt + delay, () => play(data, skill.hit, targetTags))
  })
  at(landAt, () => play(data, skill.after, targetTags))
}

/** Ends everything (a new fight, a reload of the scene). */
export function clearClientFx(): void {
  fxState.pending = []
  fxState.missiles = []
  for (const p of fxState.players) p.stop()
  fxState.players = []
}
