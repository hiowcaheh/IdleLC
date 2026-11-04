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
    const job2 = r.i32(),
      petIndex = r.i32()
    const type = r.u8()
    const flag = r.i32(),
      sorcerer = r.i32()
    const maxLevel = r.u8()
    const ranges = Array.from(r.floats(3))
    const targetType = r.u8()
    const useState = r.i32(),
      weaponsRequired = [r.i32(), r.i32()]
    const useMagic = Array.from({ length: 3 }, () => ({ magic: r.i32(), level: r.u8() }))
    const souls = r.i32(),
      applyState = r.i32()
    const readyTime = r.i32(),
      stillTime = r.i32(),
      fireTime = r.i32(),
      reuseTime = r.i32()
    const weapons = Array.from({ length: WEAPON_COUNT }, () => weaponData(r))
    const afterEffect = r.string()
    const icon = { texture: r.i32(), row: r.i32(), col: r.i32() }
    const levels = Array.from({ length: maxLevel }, (_, index) => {
      const at = r.o
      const hp = r.i32(),
        mp = r.i32(),
        gp = r.i32(),
        duration = r.i32(),
        dummyPower = r.i32()
      const needItems = Array.from({ length: 2 }, () => ({ item: r.i32(), count: r.i32() }))
      const learnLevel = r.i32(),
        learnSp = r.i32()
      const requires = Array.from({ length: 3 }, () => ({ skill: r.i32(), level: r.u8() }))
      const learnItems = Array.from({ length: 3 }, () => ({ item: r.i32(), count: r.i32() }))
      const learnAttributes = Array.from({ length: 4 }, () => r.i32())
      const applyMagic = Array.from({ length: 3 }, () => ({ magic: r.i32(), level: r.u8() }))
      const effects = Array.from({ length: 3 }, () => ({ magic: r.i32(), level: r.u8() }))
      const learnGp = r.i32(),
        attributes = Array.from({ length: 4 }, () => r.u8()),
        targetMax = r.i32()
      if (r.o - at !== LEVEL_BYTES) throw new Error('incorrect skill level boundary')
      return {
        level: index + 1,
        hp,
        mp,
        gp,
        duration,
        dummyPower,
        needItems,
        learnLevel,
        learnSp,
        requires,
        learnItems,
        learnAttributes,
        applyMagic,
        effects,
        learnGp,
        attributes,
        targetMax,
      }
    })
    records.push({
      id,
      job,
      job2,
      petIndex,
      type,
      flag,
      sorcerer,
      maxLevel,
      ranges,
      targetType,
      useState,
      weaponsRequired,
      useMagic,
      souls,
      applyState,
      readyTime,
      stillTime,
      fireTime,
      reuseTime,
      weapons,
      afterEffect,
      icon,
      levels,
    })
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
