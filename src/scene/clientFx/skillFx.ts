/**
 * Plays the client's own effect groups for skills (skills.lod ready / fire / after effects and the
 * effects the class clips key in their .bae) on the fighters' tags. ClientFxLayer draws them.
 */
import { Object3D, Quaternion, Vector3 } from 'three'
import type { CharacterHandle } from '../Character.tsx'
import { placeSourceTag } from '../upgradeEffects.ts'
import { clientFx, type ClientFxData } from './data.ts'
import type { Placement, Quat, TagLookup, Vec3 } from './particles.ts'
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
  // a group tag's points (__0_SWORD, __1_SWORD) are taken at the tag itself
  const plain = name.replace(/^__\d+_/, '')
  if (plain !== '__TOP' && placeSourceTag(target, plain, holder, scratch)) {
    return { position: toVec(scratch.position), rotation: toQuat(scratch.quaternion) }
  }
  target.object.getWorldPosition(point)
  target.object.getWorldQuaternion(turn)
  point.y += fighter.height() * fallbackHeight(plain)
  return { position: toVec(point), rotation: toQuat(turn) }
}

interface Pending {
  at: number
  start(): void
}

/** The groups playing now and the ones waiting for their time (game seconds). */
export const fxState = {
  clock: 0,
  pending: [] as Pending[],
  players: [] as EffectGroupPlayer[],
}

/** Whether a skill has effects of its own in the client data (loaded or not yet). */
export function hasClientSkillFx(skillId: number): boolean {
  const data = clientFx()
  const skill = data?.skills[skillId]
  if (!skill || !data) return false
  return [skill.ready, ...skill.fire, skill.after].some((name) => {
    const group = name ? data.groups[name] : undefined
    // the client draws it with particles or effect models (EFMD)
    return group?.effects.some((e) => {
      const kind = data.effects[e.name]?.kind
      return kind === 'EFPT' || kind === 'EFMD'
    })
  })
}

function play(data: ClientFxData, name: string | undefined, tags: TagLookup) {
  if (name && data.groups[name]) fxState.players.push(new EffectGroupPlayer(name, data, tags))
}

/**
 * A cast: the ready group at once, the fire groups when the release starts, the after group on the
 * target when it lands, and the effects the clips key at their delays. TEST-HIT is the target's
 * middle; ARROWHEAD flies from the caster's hand to it over the release.
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
  at(now, () => play(data, skill.ready, casterTags))
  for (const key of skill.clips?.ready ?? [])
    at(now + key.delay, () => play(data, key.group, casterTags))
  for (const key of skill.clips?.fire ?? [])
    at(fireAt + key.delay, () => play(data, key.group, casterTags))
  for (const name of skill.fire) at(fireAt, () => play(data, name, casterTags))
  at(landAt, () => play(data, skill.after, targetTags))
}

/** Ends everything (a new fight, a reload of the scene). */
export function clearClientFx(): void {
  fxState.pending = []
  for (const p of fxState.players) p.stop()
  fxState.players = []
}
