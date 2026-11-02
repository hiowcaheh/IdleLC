/**
 * Readable client skills.lod, serialized by Engine/Entities/Skill.cpp:140–321 (November 2018).
 * The 2015 table uses the same layout: a highest-index header, records with two weapon variants,
 * 141 bytes per skill level, -9999 terminator and the CFileSecure checksum. No byte-pattern scan.
 * Only animation/effect metadata is exposed here; gameplay still comes from the imported database.
 */
import { Reader } from './binary.mjs'

const WEAPON_COUNT = 2
const LEVEL_BYTES = 141
const END_CODE = -9999

/** Engine/Secure/FileSecure.cpp: sum a 32-bit word every 20 bytes, retaining partial-word bytes. */
function verifyChecksum(buffer) {
  if (buffer.length < 12) throw new Error('truncated skills.lod')
  const end = buffer.length - 4
  let sum = 0
  let word = 0
  for (let at = 0; at < end; at += 20) {
    for (let byte = 0; byte < Math.min(4, end - at); byte++) {
      const shift = byte * 8
      word = (word & ~(0xff << shift)) | (buffer[at + byte] << shift)
    }
    sum = (sum + word) | 0
  }
  if (sum !== buffer.readInt32LE(end)) throw new Error('invalid skills.lod checksum')
  return end
}

function weaponData(r) {
  const ready = r.string()
  const readyEffect = r.string()
  const still = r.string()
  const fire = r.string()
  const fireEffects = [r.string(), r.string(), r.string()]
  const projectile = {
    type: r.u8(),
    speed: r.f32(),
    x: r.f32(),
    z: r.f32(),
    height: r.f32(),
    coordinate: r.u8(),
    delayCount: r.u8(),
    delays: Array.from(r.floats(4)),
    destinationDelay: r.f32(),
  }
  if (projectile.delayCount > 4) throw new Error('invalid skills.lod projectile delay count')
  return { ready, readyEffect, still, fire, fireEffects, projectile }
}

/** Parse and validate the entire table, including records outside IdleLC's current class subset. */
export function parseSkillTable(buffer) {
  const end = verifyChecksum(buffer)
  const r = new Reader(buffer.subarray(0, end))
  const lastIndex = r.i32()
  if (lastIndex < 1) throw new Error('invalid skills.lod highest index')
  const records = []
  const seen = new Set()
  while (r.remaining >= 4) {
    const id = r.i32()
    if (id === END_CODE) {
      if (r.remaining !== 0) throw new Error('unexpected data after skills.lod terminator')
      return { lastIndex, records, end: buffer.length }
    }
    if (id < 1 || id > lastIndex || seen.has(id))
      throw new Error(`invalid or duplicate skills.lod id ${id}`)
    seen.add(id)
    const job = r.i32()
    r.bytes(8) // second job and pet index
    r.u8() // type
    r.bytes(8) // flags and sorcerer form
    const maxLevel = r.u8()
    r.bytes(12 + 1) // three ranges, target type
    r.bytes(12 + 15 + 4) // use state, two weapon types, three (magic, level) pairs, souls
    r.bytes(4 + 16) // application state and ready/wait/fire/reuse times
    const weapons = Array.from({ length: WEAPON_COUNT }, () => weaponData(r))
    const afterEffect = r.string()
    const icon = { texture: r.i32(), row: r.i32(), col: r.i32() }
    r.bytes(maxLevel * LEVEL_BYTES)
    records.push({ id, job, maxLevel, weapons, afterEffect, icon })
  }
  throw new Error('missing skills.lod terminator')
}

/**
 * Skill id → named phases from the first weapon variant, as the client spells them.
 * Empty phases stay absent; there is no inferred phase, cross-record matching or clip alias.
 * The frontend does not select the second weapon variant yet (retained by parseSkillTable).
 */
export function parseSkillAnims(buffer, skills, prefixes) {
  const wanted = new Map(skills.map((skill) => [skill.id, skill]))
  const found = new Map()
  for (const record of parseSkillTable(buffer).records) {
    const skill = wanted.get(record.id)
    const prefix = skill && prefixes[skill.classId]
    if (!prefix) continue
    const phases = Object.fromEntries(
      ['ready', 'still', 'fire'].flatMap((phase) => {
        const name = record.weapons[0][phase]
        return name.toLowerCase().startsWith(`${prefix}_`) ? [[phase, name]] : []
      }),
    )
    if (Object.keys(phases).length) found.set(record.id, phases)
  }
  return found
}
