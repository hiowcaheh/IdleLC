import { describe, expect, it } from 'vitest'
import { createCharacterData } from './character.ts'
import {
  SAVE_VERSION,
  applyMigrations,
  createDefaultSave,
  loadSave,
  serializeSave,
  type Migration,
  type SaveData,
} from './save.ts'

const NOW = 1_700_000_000_000

const withCharacter = (): SaveData => {
  const save = createDefaultSave(NOW)
  const hero = createCharacterData({ name: 'Aria', classId: 'mage' }, 'id-1', NOW)
  return { ...save, characters: [hero], activeCharacterId: hero.id }
}

describe('loadSave', () => {
  it('creates an empty account when nothing is stored', () => {
    const r = loadSave(null, NOW)
    expect(r.status).toBe('new')
    expect(r.save).toEqual(createDefaultSave(NOW))
    expect(r.save.characters).toEqual([])
  })

  it('round-trips a current save', () => {
    const save = withCharacter()
    save.characters[0]!.stats.kills = 12
    save.characters[0]!.level = 7
    save.settings.quality = 'low'
    const r = loadSave(serializeSave(save), NOW + 1)
    expect(r.status).toBe('loaded')
    expect(r.save).toEqual(save)
  })

  it('resets on corrupted JSON or non-object values', () => {
    expect(loadSave('{not json', NOW).status).toBe('reset-invalid')
    expect(loadSave('[1,2,3]', NOW).status).toBe('reset-invalid')
    expect(loadSave('42', NOW).status).toBe('reset-invalid')
  })

  it('resets saves from a newer game version instead of crashing', () => {
    const r = loadSave(JSON.stringify({ saveVersion: SAVE_VERSION + 1 }), NOW)
    expect(r.status).toBe('reset-newer')
    expect(r.save.saveVersion).toBe(SAVE_VERSION)
  })

  it('migrates a version 1 save into a knight called Hero', () => {
    const v1 = {
      saveVersion: 1,
      createdAt: NOW - 5000,
      settings: { quality: 'high', showDamageNumbers: false },
      location: { zoneId: 'glade', monsterId: 'stone-sentinel' },
      stats: { kills: 42, deaths: 3 },
    }
    const r = loadSave(JSON.stringify(v1), NOW)
    expect(r.status).toBe('migrated')
    expect(r.save.settings).toEqual({ quality: 'high', showDamageNumbers: false })
    expect(r.save.characters).toHaveLength(1)
    const [hero] = r.save.characters
    expect(hero).toMatchObject({
      name: 'Hero',
      classId: 'knight',
      level: 1,
      location: { zoneId: 'glade', monsterId: 'stone-sentinel' },
      stats: { kills: 42, deaths: 3 },
    })
    expect(hero!.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(r.save.activeCharacterId).toBe(hero!.id)
  })

  it('keeps a running expedition and drops one whose spot no longer exists', () => {
    const save = withCharacter()
    save.characters[0]!.expedition = { zoneId: 'glade', monsterId: 'rust-golem', startedAt: NOW }
    expect(loadSave(serializeSave(save), NOW).save.characters[0]!.expedition).toEqual({
      zoneId: 'glade',
      monsterId: 'rust-golem',
      startedAt: NOW,
    })
    save.characters[0]!.expedition = { zoneId: 'glade', monsterId: 'dragon', startedAt: NOW }
    expect(loadSave(serializeSave(save), NOW).save.characters[0]!.expedition).toBeNull()
  })

  it('gives version 2 characters an empty inventory', () => {
    const v2 = { ...withCharacter(), saveVersion: 2 }
    const hero: Record<string, unknown> = { ...v2.characters[0]! }
    delete hero.inventory
    const r = loadSave(JSON.stringify({ ...v2, characters: [hero] }), NOW)
    expect(r.status).toBe('migrated')
    expect(r.save.characters[0]!.inventory).toEqual([])
  })

  it('gives version 4 characters no SP and the free skills of their class', () => {
    const v4 = { ...withCharacter(), saveVersion: 4 }
    const knight = createCharacterData({ name: 'Brom', classId: 'knight' }, 'id-2', NOW)
    const characters = [v4.characters[0]!, knight].map((c) => {
      const old: Record<string, unknown> = { ...c }
      delete old.sp
      delete old.skills
      return old
    })
    const r = loadSave(JSON.stringify({ ...v4, characters }), NOW)
    expect(r.status).toBe('migrated')
    expect(r.save.characters.map((c) => [c.sp, c.skills])).toEqual([
      [0, {}],
      [0, { 1: { level: 1, auto: true } }],
    ])
  })

  it('dresses version 5 characters in the starter set of their class', () => {
    const v5 = { ...withCharacter(), saveVersion: 5 }
    const knight = createCharacterData({ name: 'Brom', classId: 'knight' }, 'id-2', NOW)
    const characters = [v5.characters[0]!, knight].map((c) => {
      const old: Record<string, unknown> = { ...c }
      delete old.equipment
      delete old.gear
      return old
    })
    const r = loadSave(JSON.stringify({ ...v5, characters }), NOW)
    expect(r.status).toBe('migrated')
    expect(r.save.characters[0]!.equipment).toEqual({})
    expect(r.save.characters[1]!.equipment).toMatchObject({
      weapon: { itemId: 5, plus: 0 },
      armor: { itemId: 6, plus: 0 },
    })
    expect(r.save.characters[1]!.gear).toEqual([])
  })

  it('gives version 6 characters automatic potions and a skill bar', () => {
    const v6 = { ...withCharacter(), saveVersion: 6 }
    const knight = createCharacterData({ name: 'Brom', classId: 'knight' }, 'id-2', NOW)
    const old: Record<string, unknown> = {
      ...knight,
      skills: {
        1: { level: 1, auto: true },
        2: { level: 1, auto: true },
        3: { level: 1, auto: true },
      },
    }
    delete old.potionSlots
    delete old.skillBar
    const r = loadSave(JSON.stringify({ ...v6, characters: [old] }), NOW)
    expect(r.status).toBe('migrated')
    expect(r.save.characters[0]).toMatchObject({
      potionSlots: { hp: { itemId: null, auto: true }, mp: { itemId: null, auto: true } },
      skillBar: [1, 2],
    })
  })

  it('puts the potion the bag holds most of in each quick slot of version 8 characters', () => {
    const v8 = { ...withCharacter(), saveVersion: 8 }
    const old: Record<string, unknown> = {
      ...createCharacterData({ name: 'Brom', classId: 'knight' }, 'id-4', NOW),
      inventory: [
        { itemId: 43, count: 3 }, // Small Healing Potion
        { itemId: 490, count: 9 }, // Small HP Recovery Potion
        { itemId: 484, count: 2 }, // Small Mana Potion
      ],
      potionAuto: { hp: true, mp: false },
    }
    delete old.potionSlots
    const r = loadSave(JSON.stringify({ ...v8, characters: [old] }), NOW)
    expect(r.status).toBe('migrated')
    expect(r.save.characters[0]!.potionSlots).toEqual({
      hp: { itemId: 490, auto: true },
      mp: { itemId: 484, auto: false },
    })
    expect(r.save.characters[0]).not.toHaveProperty('potionAuto')
  })

  it('opens the spots up to where version 9 characters hunt; new stats start at zero', () => {
    const v9 = { ...withCharacter(), saveVersion: 9 }
    const old: Record<string, unknown> = {
      ...createCharacterData({ name: 'Brom', classId: 'knight' }, 'id-5', NOW),
      location: { zoneId: 'glade', monsterId: 'stone-sentinel' },
      stats: { kills: 12, deaths: 1 },
    }
    delete old.reachedSpots
    const r = loadSave(JSON.stringify({ ...v9, characters: [old] }), NOW)
    expect(r.status).toBe('migrated')
    expect(r.save.characters[0]!.reachedSpots).toEqual({ glade: 'stone-sentinel' })
    expect(r.save.characters[0]!.stats).toEqual({
      kills: 12,
      deaths: 1,
      expeditions: 0,
      playSeconds: 0,
      monsterKills: {},
    })
  })

  it('keeps titles that exist (each once) and the worn one only when owned', () => {
    const save = withCharacter()
    const titled = {
      ...save.characters[0]!,
      titles: [
        { id: 1, expiresAt: NOW + 1000 },
        { id: 1, expiresAt: null },
        { id: 999, expiresAt: null },
        { id: 1 },
      ],
      activeTitle: 1,
    }
    const r = loadSave(JSON.stringify({ ...save, characters: [titled] }), NOW)
    expect(r.save.characters[0]!.titles).toEqual([{ id: 1, expiresAt: NOW + 1000 }])
    expect(r.save.characters[0]!.activeTitle).toBe(1)
    const unowned = { ...titled, titles: [], activeTitle: 1 }
    const r2 = loadSave(JSON.stringify({ ...save, characters: [unowned] }), NOW)
    expect(r2.save.characters[0]!.activeTitle).toBeNull()
  })

  it('empties quick slots holding something that is not a potion of their kind', () => {
    const save = withCharacter()
    const broken = {
      ...save.characters[0]!,
      potionSlots: { hp: { itemId: 484, auto: true }, mp: { itemId: 'x', auto: false } },
    }
    const r = loadSave(JSON.stringify({ ...save, characters: [broken] }), NOW)
    expect(r.save.characters[0]!.potionSlots).toEqual({
      hp: { itemId: null, auto: true },
      mp: { itemId: null, auto: false },
    })
  })

  it('gives version 7 characters an empty play-time counter', () => {
    const v7 = { ...withCharacter(), saveVersion: 7 }
    const old: Record<string, unknown> = {
      ...createCharacterData({ name: 'Brom', classId: 'knight' }, 'id-3', NOW),
    }
    delete old.optionProgress
    const r = loadSave(JSON.stringify({ ...v7, characters: [old] }), NOW)
    expect(r.status).toBe('migrated')
    expect(r.save.characters[0]!.optionProgress).toBe(0)
  })

  it('keeps the rare set of identified pieces; others of a rare item are unidentified', () => {
    const save = withCharacter()
    const gear = [
      { uid: 'a', itemId: 1845, plus: 0, rare: 7, options: [{ type: 20, level: 3 }] },
      { uid: 'b', itemId: 1845, plus: 2, rare: 999, options: [{ type: 20, level: 3 }] },
      { uid: 'c', itemId: 4, plus: 0, rare: 7, options: [{ type: 20, level: 2 }] },
    ]
    const stored = { ...save, characters: [{ ...save.characters[0], gear }] }
    const loaded = loadSave(JSON.stringify(stored), NOW).save.characters[0]!.gear
    expect(loaded).toEqual([
      { uid: 'a', itemId: 1845, plus: 0, rare: 7, options: [{ type: 20, level: 3 }] },
      { uid: 'b', itemId: 1845, plus: 2 },
      { uid: 'c', itemId: 4, plus: 0, options: [{ type: 20, level: 2 }] },
    ])
  })

  it('keeps options that exist and accessories in accessory slots', () => {
    const save = withCharacter()
    const ring = {
      uid: 'r',
      itemId: 166,
      plus: 3,
      options: [
        { type: 20, level: 2 },
        { type: 999, level: 1 },
        { type: 21, level: 99 },
      ],
    }
    const broken = {
      ...save,
      characters: [
        {
          ...save.characters[0],
          equipment: { accessory2: ring, helmet: { ...ring, uid: 'h' } },
          skillBar: [1, 1, 3, 'x'],
        },
      ],
    }
    const [hero] = loadSave(JSON.stringify(broken), NOW).save.characters
    // accessories can't be upgraded: the "+" goes
    expect(hero!.equipment).toEqual({
      accessory2: { uid: 'r', itemId: 166, plus: 0, options: [{ type: 20, level: 2 }] },
    })
    expect(hero!.skillBar).toEqual([])
  })

  it('keeps worn and bagged gear that exists, in its own slot', () => {
    const save = withCharacter()
    const broken = {
      ...save,
      characters: [
        {
          ...save.characters[0],
          equipment: {
            weapon: { uid: 'a', itemId: 4, plus: 99 },
            helmet: { uid: 'b', itemId: 6, plus: 0 }, // armor piece in the helmet slot
            boots: { uid: 'c', itemId: 1, plus: 0 }, // not gear
          },
          gear: [{ uid: 'd', itemId: 7, plus: 2 }, { uid: '', itemId: 7 }, 'x'],
        },
      ],
    }
    const [hero] = loadSave(JSON.stringify(broken), NOW).save.characters
    expect(hero!.equipment).toEqual({ weapon: { uid: 'a', itemId: 4, plus: 15 } })
    expect(hero!.gear).toEqual([{ uid: 'd', itemId: 7, plus: 2 }])
  })

  it('keeps only skills of the class, at levels they have', () => {
    const save = withCharacter()
    const knight = createCharacterData({ name: 'Brom', classId: 'knight' }, 'id-2', NOW)
    const broken = {
      ...save,
      characters: [
        {
          ...knight,
          sp: -5,
          skills: {
            1: { level: 9, auto: false },
            2: { level: 0 },
            3: { level: 1 },
            77: { level: 1 },
          },
        },
      ],
    }
    const [hero] = loadSave(JSON.stringify(broken), NOW).save.characters
    expect(hero!.sp).toBe(0)
    expect(hero!.skills).toEqual({ 1: { level: 3, auto: false }, 3: { level: 1, auto: true } })
  })

  it('repairs invalid character fields and drops unrecoverable characters', () => {
    const save = withCharacter()
    const broken = {
      ...save,
      settings: { quality: 'extreme', showDamageNumbers: false },
      characters: [
        {
          ...save.characters[0],
          level: 500,
          exp: -3,
          gold: 5.7,
          location: { zoneId: 'nowhere', monsterId: 'dragon' },
          stats: { kills: 5.7, deaths: -3 },
          inventory: [
            { itemId: 1, count: 2 },
            { itemId: 1, count: 3 },
            { itemId: -4, count: 1 },
            'x',
          ],
        },
        { id: 'x', name: 'Ghost', classId: 'necromancer' },
        'garbage',
      ],
      activeCharacterId: 'missing',
    }
    const r = loadSave(JSON.stringify(broken), NOW)
    expect(r.save.settings).toEqual({ quality: 'auto', showDamageNumbers: false })
    expect(r.save.characters).toHaveLength(1)
    expect(r.save.characters[0]).toMatchObject({
      level: 99,
      exp: 0,
      gold: 5,
      location: save.characters[0]!.location,
      stats: { kills: 5, deaths: 0 },
      inventory: [{ itemId: 1, count: 5 }],
    })
    expect(r.save.activeCharacterId).toBeNull()
  })

  it('keeps the zone but picks its first monster when the monster is not there', () => {
    const save = withCharacter()
    save.characters[0]!.location = { zoneId: 'glade', monsterId: 'missing' }
    const r = loadSave(JSON.stringify(save), NOW)
    expect(r.save.characters[0]!.location).toEqual({ zoneId: 'glade', monsterId: 'rust-golem' })
  })
})

describe('applyMigrations', () => {
  const migrations: Record<number, Migration> = {
    1: (s) => ({ ...s, gold: 0 }),
    2: (s) => ({ ...s, gold: (s.gold as number) + 100, renamed: s.old, old: undefined }),
  }

  it('runs every step in order up to the target version', () => {
    const out = applyMigrations({ saveVersion: 1, old: 'x' }, migrations, 3)
    expect(out).toEqual({ saveVersion: 3, gold: 100, renamed: 'x', old: undefined })
  })

  it('returns the input when already at the target', () => {
    expect(applyMigrations({ saveVersion: 3, a: 1 }, migrations, 3)).toEqual({
      saveVersion: 3,
      a: 1,
    })
  })

  it('returns null when a migration step is missing or the save is newer', () => {
    expect(applyMigrations({ saveVersion: 0 }, migrations, 3)).toBeNull()
    expect(applyMigrations({ saveVersion: 4 }, migrations, 3)).toBeNull()
  })
})
