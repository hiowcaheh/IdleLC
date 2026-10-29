import { describe, expect, it } from 'vitest'
import { EXP_TABLE } from '../data/progression.ts'
import { MONSTERS } from '../data/monsters.ts'
import { AFK_MAX_SECONDS, AFK_MIN_SECONDS } from '../logic/afk.ts'
import { GameError, MAX_CHARACTERS } from '../logic/character.ts'
import { createRng } from '../logic/rng.ts'
import { MAX_PLAY_GAP, MIN_KILL_CYCLE, KILL_BURST } from '../logic/rewards.ts'
import { SAVE_VERSION } from '../logic/save.ts'
import { SP_UNIT } from '../logic/skills.ts'
import { GOLDEN_MAGNIFIER_ID, HEAVEN_STONE_ID, SMELTING_STONE_ID } from '../data/items.ts'
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

  it('sells drops for their price and saves the sale', async () => {
    const { game, clock, hero, storage } = await withKnight()
    clock.now += 600 * 1000
    const { character } = await game.reportCombat(hero.id, {
      monsterId: hero.location.monsterId,
      kills: 100,
      deaths: 0,
    })
    const [stack] = character.inventory
    const sale = await game.sellItems(hero.id, [stack!])
    expect(sale.gold).toBeGreaterThan(0)
    expect(sale.character.gold).toBe(character.gold + sale.gold)
    expect(sale.character.inventory.find((s) => s.itemId === stack!.itemId)).toBeUndefined()
    expect(stored(storage).characters[0].gold).toBe(sale.character.gold)
    await expect(game.sellItems(hero.id, [stack!])).rejects.toThrow('not-enough-items')
  })

  it('earns SP from kills and spends it on skills', async () => {
    const { game, clock, hero, storage } = await withKnight()
    expect(hero.skills).toEqual({ 1: { level: 1, auto: true } })
    await expect(game.learnSkill(hero.id, 1)).rejects.toThrow('level-too-low')
    await game.dev.setLevel(hero.id, 3)

    clock.now += 600 * 1000
    const kills = Math.ceil(SP_UNIT / fox(hero).sp!)
    const result = await game.reportCombat(hero.id, {
      monsterId: hero.location.monsterId,
      kills,
      deaths: 0,
    })
    expect(result.sp).toBe(kills * fox(hero).sp!)
    expect(result.character.sp).toBeGreaterThanOrEqual(SP_UNIT)

    const learned = await game.learnSkill(hero.id, 1)
    expect(learned.skills[1]).toEqual({ level: 2, auto: true })
    expect(learned.sp).toBe(result.character.sp - SP_UNIT)
    expect(stored(storage).characters[0].skills[1].level).toBe(2)

    const manual = await game.setSkillAuto(hero.id, 1, false)
    expect(manual.skills[1]!.auto).toBe(false)
    await expect(game.setSkillAuto(hero.id, 3, true)).rejects.toThrow('not-learned')

    await game.startAfk(hero.id)
    await expect(game.learnSkill(hero.id, 1)).rejects.toThrow('on-expedition')
  })

  it('counts active play between reports (at most 2 minutes each) toward options on worn gear', async () => {
    const { game, clock, hero } = await withKnight()
    const report = { monsterId: hero.location.monsterId, kills: 0, deaths: 0 }
    clock.now += 3600 * 1000 // the game was closed: only MAX_PLAY_GAP counts
    const first = await game.reportCombat(hero.id, report)
    expect(first.character.optionProgress).toBe(MAX_PLAY_GAP)
    expect(first.optionsGained).toEqual([])

    game.dev.setTimeScale(5) // dev speed: 2 minutes are 10 minutes of play
    clock.now += MAX_PLAY_GAP * 1000
    const second = await game.reportCombat(hero.id, report)
    expect(second.optionsGained).toHaveLength(1)
    const { slot, option } = second.optionsGained[0]!
    expect(second.character.equipment[slot]!.options).toEqual([option])
  })

  it('identifies rare items with magnifying glasses bought in the shop', async () => {
    const { game, hero, storage } = await withKnight()
    await game.dev.addGold(hero.id, 1_000_000)
    await game.buyItem(hero.id, GOLDEN_MAGNIFIER_ID, 1)
    // a rare sword in the bag (no placeholder shop or monster has one)
    const saved = stored(storage)
    saved.characters[0].inventory.push({ itemId: 1845, count: 2 })
    storage.setItem(SAVE_KEY, JSON.stringify(saved))
    await game.load()
    const r = await game.identifyItems(hero.id, GOLDEN_MAGNIFIER_ID, [{ itemId: 1845, count: 2 }])
    expect(r.used).toBe(1)
    expect(r.character.gear).toHaveLength(1)
    expect(r.character.gear[0]!.rare).toBeDefined()
    expect(r.character.inventory).toContainEqual({ itemId: 1845, count: 1 })
    const sale = await game.sellGear(hero.id, [r.character.gear[0]!.uid])
    expect(sale.gold).toBe(Math.floor(1044040 * 0.4))
  })

  it('takes reported potions out of the bag', async () => {
    const { game, hero } = await withKnight()
    await game.dev.addGold(hero.id, 2000)
    await game.buyItem(hero.id, 43, 3)
    const result = await game.reportCombat(hero.id, {
      monsterId: hero.location.monsterId,
      kills: 0,
      deaths: 0,
      potions: [{ itemId: 43, count: 2 }],
    })
    expect(result.potionsUsed).toEqual([{ itemId: 43, count: 2 }])
    expect(result.character.inventory).toContainEqual({ itemId: 43, count: 1 })
  })

  it('buys, wears and upgrades gear, and keeps it after a reload', async () => {
    const { game, clock, hero, storage } = await withKnight()
    await game.dev.addGold(hero.id, 3200)
    await game.dev.setLevel(hero.id, 3)
    await expect(game.buyItem(hero.id, 1, 1)).rejects.toThrow('not-in-shop')
    await expect(game.buyItem(hero.id, SMELTING_STONE_ID, 1)).rejects.toThrow('not-in-shop')
    await game.buyItem(hero.id, 4, 1)
    const stones = await game.buyItem(hero.id, HEAVEN_STONE_ID, 3)
    expect(stones.character.gold).toBe(3200 - 120 - 3000)

    const armed = await game.equipItem(hero.id, { itemId: 4 })
    expect(armed.equipment.weapon).toMatchObject({ itemId: 4, plus: 0 })
    expect(armed.inventory).toContainEqual({ itemId: 5, count: 1 }) // the old sword

    const upgrade = await game.upgradeItem(hero.id, 'weapon')
    expect(upgrade.character.equipment.weapon!.plus).toBe(upgrade.plusAfter)
    expect(upgrade.character.inventory).toContainEqual({ itemId: HEAVEN_STONE_ID, count: 2 })

    const reloaded = new LocalGameService(storage, { now: () => clock.now, rng: createRng(1) })
    const { save } = await reloaded.load()
    expect(save.characters[0]!.equipment.weapon).toEqual(upgrade.character.equipment.weapon)

    await game.startAfk(hero.id)
    await expect(game.unequipItem(hero.id, 'weapon')).rejects.toThrow('on-expedition')
  })

  it('offers a dev command for skill points', async () => {
    const { game, hero } = await withKnight()
    expect((await game.dev.addSp(hero.id, 12)).sp).toBe(12 * SP_UNIT)
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
