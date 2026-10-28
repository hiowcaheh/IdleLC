import { describe, expect, it } from 'vitest'
import { createRng } from '../logic/rng.ts'
import { SAVE_VERSION } from '../logic/save.ts'
import type { KeyValueStorage } from './GameService.ts'
import { LocalGameService, SAVE_KEY } from './LocalGameService.ts'

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>()
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
}

const make = (storage = new MemoryStorage()) =>
  new LocalGameService(storage, { rng: createRng(1), now: () => 1000 })

describe('LocalGameService', () => {
  it('creates and persists a new save on first load', () => {
    const storage = new MemoryStorage()
    expect(make(storage).load()).toBe('new')
    const stored = JSON.parse(storage.getItem(SAVE_KEY)!)
    expect(stored.saveVersion).toBe(SAVE_VERSION)
  })

  it('persists kills after monsters die and restores them on reload', () => {
    const storage = new MemoryStorage()
    const game = make(storage)
    game.load()
    for (let i = 0; i < 60 * 60; i++) game.combatTick(1 / 60)
    const kills = game.getSave().stats.kills
    expect(kills).toBeGreaterThan(0)

    const reloaded = make(storage)
    expect(reloaded.load()).toBe('loaded')
    expect(reloaded.getSave().stats.kills).toBe(kills)
    expect(reloaded.getCombat().kills).toBe(kills)
  })

  it('switches monsters within the zone and remembers the choice', () => {
    const storage = new MemoryStorage()
    const game = make(storage)
    game.load()
    game.selectMonster('stone-sentinel')
    expect(game.getCombat().monsterId).toBe('stone-sentinel')
    expect(make(storage).getSave().location.monsterId).not.toBe('stone-sentinel') // not loaded yet
    const reloaded = make(storage)
    reloaded.load()
    expect(reloaded.getSave().location.monsterId).toBe('stone-sentinel')
  })

  it('rejects monsters from outside the current zone', () => {
    const game = make()
    game.load()
    expect(() => game.selectMonster('dragon')).toThrow()
  })

  it('updates settings and resets the save', () => {
    const storage = new MemoryStorage()
    const game = make(storage)
    game.load()
    game.updateSettings({ quality: 'low' })
    expect(game.getSave().settings.quality).toBe('low')
    for (let i = 0; i < 60 * 30; i++) game.combatTick(1 / 60)

    const fresh = game.resetSave()
    expect(fresh.settings.quality).toBe('auto')
    expect(fresh.stats.kills).toBe(0)
    expect(game.getCombat().phase).toBe('spawning')
  })

  it('recovers from a corrupted save', () => {
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, '{oops')
    const game = make(storage)
    expect(game.load()).toBe('reset-invalid')
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).saveVersion).toBe(SAVE_VERSION)
  })

  it('keeps running when storage throws', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    }
    const game = make(broken as MemoryStorage)
    expect(game.load()).toBe('new')
    expect(() => game.combatTick(5)).not.toThrow()
    expect(() => game.resetSave()).not.toThrow()
  })
})
