import { describe, expect, it } from 'vitest'
import {
  SAVE_VERSION,
  applyMigrations,
  createDefaultSave,
  loadSave,
  serializeSave,
  type Migration,
} from './save.ts'

const NOW = 1_700_000_000_000

describe('loadSave', () => {
  it('creates a default save when nothing is stored', () => {
    const r = loadSave(null, NOW)
    expect(r.status).toBe('new')
    expect(r.save).toEqual(createDefaultSave(NOW))
  })

  it('round-trips a current save', () => {
    const save = createDefaultSave(NOW)
    save.stats.kills = 12
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

  it('repairs invalid fields with defaults but keeps valid ones', () => {
    const r = loadSave(
      JSON.stringify({
        saveVersion: SAVE_VERSION,
        createdAt: NOW,
        settings: { quality: 'ultra', showDamageNumbers: false },
        location: { zoneId: 'nowhere', monsterId: 'dragon' },
        stats: { kills: 5.7, deaths: -3 },
      }),
      NOW,
    )
    expect(r.save.settings).toEqual({ quality: 'auto', showDamageNumbers: false })
    expect(r.save.location).toEqual(createDefaultSave(NOW).location)
    expect(r.save.stats).toEqual({ kills: 5, deaths: 0 })
  })

  it('rejects a monster that does not belong to the saved zone', () => {
    const save = createDefaultSave(NOW)
    const r = loadSave(
      JSON.stringify({ ...save, location: { zoneId: 'glade', monsterId: 'missing' } }),
      NOW,
    )
    expect(r.save.location.monsterId).toBe(save.location.monsterId)
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
