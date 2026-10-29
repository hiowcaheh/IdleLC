import { describe, expect, it } from 'vitest'
import { EXP_TABLE } from '../data/progression.ts'
import { MONSTERS } from '../data/monsters.ts'
import { AFK_MAX_SECONDS, AFK_MIN_SECONDS } from '../logic/afk.ts'
import { GameError, MAX_CHARACTERS } from '../logic/character.ts'
import { createRng } from '../logic/rng.ts'
import { MIN_KILL_CYCLE, KILL_BURST } from '../logic/rewards.ts'
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

/** A service with a controllable clock (ms). */
function make(storage = new MemoryStorage()) {
  const clock = { now: 1_000_000 }
  const game = new LocalGameService(storage, { now: () => clock.now, rng: createRng(5) })
  return { game, clock, storage }
}

const stored = (storage: MemoryStorage) => JSON.parse(storage.getItem(SAVE_KEY)!)

async function withKnight() {
  const ctx = make()
  await ctx.game.load()
  const hero = await ctx.game.createCharacter({ name: 'Brom', classId: 'knight' })
  await ctx.game.setActiveCharacter(hero.id)
  return { ...ctx, hero }
}

const fox = (hero: { location: { monsterId: string } }) => MONSTERS[hero.location.monsterId]!

describe('LocalGameService', () => {
  it('creates and persists an empty account on first load', async () => {
    const { game, storage } = make()
    const { status, save } = await game.load()
    expect(status).toBe('new')
    expect(save.characters).toEqual([])
    expect(stored(storage).saveVersion).toBe(SAVE_VERSION)
  })

  it('creates characters with the account rules and keeps them after a reload', async () => {
    const { game, storage } = make()
    await game.load()
    const hero = await game.createCharacter({ name: '  Brom ', classId: 'knight' })
    expect(hero).toMatchObject({ name: 'Brom', classId: 'knight', level: 1, exp: 0, gold: 0 })

    await expect(game.createCharacter({ name: 'brom', classId: 'mage' })).rejects.toThrow(
      'name-taken',
    )
    await expect(game.createCharacter({ name: 'x', classId: 'mage' })).rejects.toBeInstanceOf(
      GameError,
    )

    const reloaded = make(storage).game
    const { status, save } = await reloaded.load()
    expect(status).toBe('loaded')
    expect(save.characters.map((c) => c.name)).toEqual(['Brom'])
  })

  it(`allows at most ${MAX_CHARACTERS} characters and frees a slot on delete`, async () => {
    const { game } = make()
    await game.load()
    const names = ['Anna', 'Bert', 'Cora', 'Dain']
    const created = []
    for (const name of names) created.push(await game.createCharacter({ name, classId: 'rogue' }))
    await expect(game.createCharacter({ name: 'Ezra', classId: 'rogue' })).rejects.toThrow(
      'no-free-slot',
    )
    await game.setActiveCharacter(created[0]!.id)
    await game.deleteCharacter(created[0]!.id)
    const { save } = await game.load()
    expect(save.activeCharacterId).toBeNull()
    await expect(game.createCharacter({ name: 'Ezra', classId: 'rogue' })).resolves.toBeTruthy()
  })

  it('returns copies that do not change the saved game', async () => {
    const { game, hero } = await withKnight()
    hero.gold = 999_999
    const { save } = await game.load()
    expect(save.characters[0]!.gold).toBe(0)
  })

  it('pays exp and gold for reported kills and levels up from the exp table', async () => {
    const { game, clock, hero, storage } = await withKnight()
    const monster = fox(hero)
    const kills = Math.ceil(EXP_TABLE[0]! / monster.exp)
    clock.now += kills * MIN_KILL_CYCLE * 1000
    const result = await game.reportCombat(hero.id, {
      monsterId: monster.id,
      kills,
      deaths: 1,
    })
    expect(result).toMatchObject({ kills, exp: kills * monster.exp, gold: kills * monster.gold })
    expect(result.levelsGained).toBe(1)
    expect(result.character).toMatchObject({
      level: 2,
      exp: kills * monster.exp - EXP_TABLE[0]!,
      gold: kills * monster.gold,
      stats: { kills, deaths: 1 },
    })
    expect(stored(storage).characters[0].level).toBe(2)
  })

  it('puts the drops of reported kills into the inventory', async () => {
    const { game, clock, hero } = await withKnight()
    clock.now += 600 * 1000
    const result = await game.reportCombat(hero.id, {
      monsterId: hero.location.monsterId,
      kills: 100,
      deaths: 0,
    })
    expect(result.drops.length).toBeGreaterThan(0)
    expect(result.character.inventory).toEqual(result.drops)
  })

  it('pays an expedition for the time it lasted, at most 8 hours', async () => {
    const { game, clock, hero, storage } = await withKnight()
    const away = await game.startAfk(hero.id)
    expect(away.expedition).toEqual({ ...hero.location, startedAt: clock.now })
    expect(stored(storage).characters[0].expedition).not.toBeNull()

    clock.now += 10 * 3600 * 1000
    const afk = await game.claimAfk(hero.id)
    expect(afk.awaySeconds).toBe(10 * 3600)
    expect(afk.seconds).toBe(AFK_MAX_SECONDS)
    expect(afk.kills).toBeGreaterThan(0)
    expect(afk.character.expedition).toBeNull()
    expect(afk.character.level).toBeGreaterThan(1)
    expect(afk.character.inventory.length).toBeGreaterThan(0)
    expect(stored(storage).characters[0]).toMatchObject({ gold: afk.gold, expedition: null })

    await expect(game.claimAfk(hero.id)).rejects.toThrow('no-expedition')
  })

  it('pays nothing for an expedition shorter than a minute', async () => {
    const { game, clock, hero } = await withKnight()
    await game.startAfk(hero.id)
    clock.now += (AFK_MIN_SECONDS - 1) * 1000
    const afk = await game.claimAfk(hero.id)
    expect(afk).toMatchObject({ seconds: 0, kills: 0, exp: 0, gold: 0, drops: [] })
    expect(afk.character.expedition).toBeNull()
  })

  it('keeps an expedition across reloads and blocks fights and travel meanwhile', async () => {
    const { game, clock, hero, storage } = await withKnight()
    await game.startAfk(hero.id)
    await expect(game.startAfk(hero.id)).rejects.toThrow('on-expedition')
    await expect(
      game.reportCombat(hero.id, { monsterId: hero.location.monsterId, kills: 1, deaths: 0 }),
    ).rejects.toThrow('on-expedition')
    await expect(
      game.travel(hero.id, { zoneId: 'glade', monsterId: 'stone-sentinel' }),
    ).rejects.toThrow('on-expedition')

    clock.now += 3600 * 1000
    const reloaded = new LocalGameService(storage, { now: () => clock.now, rng: createRng(9) })
    await reloaded.load()
    expect((await reloaded.claimAfk(hero.id)).seconds).toBe(3600)
  })

  it('simulates a long expedition with a dev command', async () => {
    const { game, hero } = await withKnight()
    const away = await game.dev.simulateAfk(hero.id, 3600)
    expect(away.expedition).not.toBeNull()
    expect((await game.claimAfk(hero.id)).seconds).toBe(3600)
  })

  it('caps kills that come faster than a fight can take', async () => {
    const { game, clock, hero } = await withKnight()
    clock.now += 10 * 1000
    const allowed = Math.floor(10 / MIN_KILL_CYCLE) + KILL_BURST
    const result = await game.reportCombat(hero.id, {
      monsterId: hero.location.monsterId,
      kills: 1000,
      deaths: 0,
    })
    expect(result.kills).toBe(allowed)

    // the dev game speed allows proportionally more
    game.dev.setTimeScale(10)
    clock.now += 10 * 1000
    const fast = await game.reportCombat(hero.id, {
      monsterId: hero.location.monsterId,
      kills: 1000,
      deaths: 0,
    })
    expect(fast.kills).toBe(Math.floor(100 / MIN_KILL_CYCLE) + KILL_BURST)
  })

  it('rejects reports for a monster the character is not hunting', async () => {
    const { game, hero } = await withKnight()
    await expect(
      game.reportCombat(hero.id, { monsterId: 'stone-sentinel', kills: 1, deaths: 0 }),
    ).rejects.toThrow('wrong-monster')
    await expect(
      game.reportCombat('nobody', { monsterId: hero.location.monsterId, kills: 1, deaths: 0 }),
    ).rejects.toThrow('unknown-character')
  })

  it('travels only to existing spots', async () => {
    const { game, hero } = await withKnight()
    const moved = await game.travel(hero.id, { zoneId: 'glade', monsterId: 'stone-sentinel' })
    expect(moved.location.monsterId).toBe('stone-sentinel')
    await expect(game.travel(hero.id, { zoneId: 'glade', monsterId: 'dragon' })).rejects.toThrow(
      'wrong-monster',
    )
    await expect(game.travel(hero.id, { zoneId: 'nowhere', monsterId: 'x' })).rejects.toThrow(
      'unknown-zone',
    )
  })

  it('offers dev commands for level, exp and gold', async () => {
    const { game, hero } = await withKnight()
    expect((await game.dev.setLevel(hero.id, 500)).level).toBe(99)
    expect((await game.dev.setLevel(hero.id, 5)).level).toBe(5)
    const levelled = await game.dev.addExp(hero.id, EXP_TABLE[4]! + 1)
    expect(levelled).toMatchObject({ level: 6, exp: 1 })
    expect((await game.dev.addGold(hero.id, 1000)).gold).toBe(1000)
  })

  it('updates settings and resets the whole save', async () => {
    const { game, storage } = await withKnight()
    expect(await game.updateSettings({ quality: 'low' })).toMatchObject({ quality: 'low' })
    const fresh = await game.resetSave()
    expect(fresh.characters).toEqual([])
    expect(fresh.settings.quality).toBe('auto')
    expect(stored(storage).characters).toEqual([])
  })

  it('recovers from a corrupted save', async () => {
    const storage = new MemoryStorage()
    storage.setItem(SAVE_KEY, '{oops')
    const { game } = make(storage)
    expect((await game.load()).status).toBe('reset-invalid')
    expect(stored(storage).saveVersion).toBe(SAVE_VERSION)
  })

  it('keeps running when storage throws', async () => {
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
    const { game } = make(broken as MemoryStorage)
    expect((await game.load()).status).toBe('new')
    await expect(game.createCharacter({ name: 'Solo', classId: 'titan' })).resolves.toBeTruthy()
    await expect(game.resetSave()).resolves.toBeTruthy()
  })
})
