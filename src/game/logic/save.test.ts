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

  it('repairs invalid character fields and drops unrecoverable characters', () => {
    const save = withCharacter()
    const broken = {
      ...save,
      settings: { quality: 'ultra', showDamageNumbers: false },
      characters: [
        {
          ...save.characters[0],
          level: 500,
          exp: -3,
          gold: 5.7,
          location: { zoneId: 'nowhere', monsterId: 'dragon' },
          stats: { kills: 5.7, deaths: -3 },
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
