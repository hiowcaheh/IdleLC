import { describe, expect, it, vi } from 'vitest'

vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
}))

import { ZONES } from '../data/zones.ts'
import { createCharacterData, type CharacterData } from '../logic/character.ts'
import { createDefaultSave } from '../logic/save.ts'
import { createRng } from '../logic/rng.ts'
import { worldBossCharge } from '../logic/worldBoss.ts'
import type { KeyValueStorage } from './GameService.ts'
import { LocalGameService, SAVE_KEY } from './LocalGameService.ts'

function fixture(kills = 2000) {
  const clock = { now: 1_000_000 }
  const character = {
    ...createCharacterData({ name: 'BossHero', classId: 'knight' }, 'boss', clock.now),
    level: 100,
    worldBoss: { kills: { 'lc-zone-0': kills }, defeated: {}, active: null },
  }
  const save = {
    ...createDefaultSave(clock.now),
    activeCharacterId: character.id,
    characters: [character],
  }
  const data = new Map([[SAVE_KEY, JSON.stringify(save)]])
  const storage: KeyValueStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v)
    },
    removeItem: (k) => {
      data.delete(k)
    },
  }
  const game = new LocalGameService(storage, { now: () => clock.now, rng: createRng(5) })
  const read = (): CharacterData => JSON.parse(data.get(SAVE_KEY)!).characters[0]
  return { clock, game, storage, character, read }
}

describe('World Boss service lifecycle', () => {
  it('fills only the current map in DEV without adding kills, then marks its attempt as a test', async () => {
    const f = fixture(15)
    await f.game.load()
    const filled = await f.game.dev!.fillWorldBossCharge('boss')
    expect(filled.worldBoss!.kills).toEqual({ 'lc-zone-0': 2000 })
    expect(filled.stats).toEqual(f.character.stats)
    const boss = (await f.game.summonWorldBoss('boss')).worldBoss!.active!
    await expect(f.game.dev!.fillWorldBossCharge('boss')).rejects.toThrow('world-boss-unavailable')
    f.clock.now += 10000
    const result = await f.game.reportCombat('boss', {
      monsterId: boss.monsterId,
      encounterId: boss.id,
      kills: 1,
      deaths: 0,
      worldBossTime: { started: true, seconds: 2.35, assisted: false },
    })
    expect(result.character.worldBoss!.history!.at(-1)).toMatchObject({
      combatMs: 2350,
      assisted: true,
      outcome: 'victory',
    })
  })

  it('saves combat time and pending loot atomically, restores the window on reload, and resumes once', async () => {
    const f = fixture()
    await f.game.load()
    const boss = (await f.game.summonWorldBoss('boss')).worldBoss!.active!
    f.clock.now += 65000 // Includes the approach: the reported combat itself took only five seconds.
    const result = await f.game.reportCombat('boss', {
      monsterId: boss.monsterId,
      encounterId: boss.id,
      kills: 1,
      deaths: 0,
      worldBossTime: { started: true, seconds: 5, assisted: false },
    })
    const progress = result.character.worldBoss!
    expect(progress.history).toHaveLength(1)
    expect(progress.history![0]).toMatchObject({
      encounterId: boss.id,
      combatMs: 5000,
      assisted: false,
      outcome: 'victory',
    })
    expect(progress.pending).toMatchObject({
      record: progress.history![0],
      drops: result.drops,
      gold: result.gold,
      sp: result.sp,
      exp: result.exp,
    })
    await expect(f.game.travel('boss', f.character.location)).rejects.toThrow(
      'world-boss-result-pending',
    )
    await expect(f.game.startAfk('boss')).rejects.toThrow('world-boss-result-pending')
    await expect(f.game.startDungeon('boss', 'belfist')).rejects.toThrow(
      'world-boss-result-pending',
    )
    await expect(
      f.game.reportCombat('boss', {
        monsterId: f.character.location.monsterId,
        kills: 1,
        deaths: 0,
      }),
    ).rejects.toThrow('world-boss-result-pending')
    f.clock.now += 120000
    const reloaded = new LocalGameService(f.storage, { now: () => f.clock.now, rng: createRng(9) })
    const loaded = (await reloaded.load()).save.characters[0]!
    expect(loaded.worldBoss!.pending).toEqual(progress.pending)
    expect(loaded.worldBoss!.history).toEqual(progress.history)
    expect(loaded.inventory).toEqual(result.character.inventory)
    expect(loaded.gear).toEqual(result.character.gear)
    f.clock.now += 120000
    const resumed = await reloaded.acknowledgeWorldBossLoot('boss')
    expect(resumed.worldBoss!.pending).toBeUndefined()
    expect(resumed.lastPlayedAt).toBe(f.clock.now)
    expect(resumed.inventory).toEqual(result.character.inventory)
    const saved = f.storage.getItem(SAVE_KEY)
    await reloaded.acknowledgeWorldBossLoot('boss')
    expect(f.storage.getItem(SAVE_KEY)).toBe(saved)
    const next = await reloaded.reportCombat('boss', {
      monsterId: f.character.location.monsterId,
      kills: 1,
      deaths: 0,
    })
    expect(next.character.stats.playSeconds).toBe(resumed.stats.playSeconds)
    expect(next.character.optionProgress).toBe(resumed.optionProgress)
  })

  it('records timed deaths, departures and interrupted attempts, and rejects invalid clocks', async () => {
    for (const outcome of ['death', 'left', 'interrupted'] as const) {
      const f = fixture()
      await f.game.load()
      const boss = (await f.game.summonWorldBoss('boss')).worldBoss!.active!
      const report = {
        monsterId: boss.monsterId,
        encounterId: boss.id,
        kills: 0,
        deaths: 0,
        worldBossTime: { started: true, seconds: 12.35, assisted: false },
      }
      const saved = f.storage.getItem(SAVE_KEY)
      for (const invalid of [-1, Infinity, NaN])
        await expect(
          f.game.reportCombat('boss', {
            ...report,
            worldBossTime: { ...report.worldBossTime, seconds: invalid },
          }),
        ).rejects.toThrow('invalid-world-boss-time')
      expect(f.storage.getItem(SAVE_KEY)).toBe(saved)
      f.clock.now += 20000
      await f.game.reportCombat('boss', { ...report, deaths: outcome === 'death' ? 1 : 0 })
      if (outcome === 'left') await f.game.cancelWorldBoss('boss')
      if (outcome === 'interrupted') await f.game.load()
      expect(f.read().worldBoss!.history!.at(-1)).toMatchObject({
        outcome,
        combatMs: 12350,
        assisted: false,
      })
      expect(f.read().worldBoss!.pending).toBeUndefined()
    }
  })
  it('counts only accepted field kills and refuses early summoning', async () => {
    const f = fixture(1999)
    await f.game.load()
    await expect(f.game.summonWorldBoss('boss')).rejects.toThrow('world-boss-not-ready')
    await expect(
      f.game.reportCombat('boss', { monsterId: 'lc-307', kills: 1, deaths: 0 }),
    ).rejects.toThrow('wrong-monster')
    expect(worldBossCharge(f.read())).toBe(1999)
    const paid = await f.game.reportCombat('boss', {
      monsterId: f.character.location.monsterId,
      kills: 1,
      deaths: 0,
    })
    expect(paid.kills).toBe(1)
    expect(worldBossCharge(paid.character)).toBe(2000)
    const summoned = await f.game.summonWorldBoss('boss')
    expect(worldBossCharge(summoned)).toBe(0)
    expect(summoned.location).toEqual(f.character.location)
    expect(summoned.worldBoss!.active!.monsterId).toBe('lc-308')
    await expect(f.game.summonWorldBoss('boss')).rejects.toThrow('world-boss-active')
  })

  it('pays one boss once and rejects old field reports and replayed encounter reports', async () => {
    const f = fixture()
    await f.game.load()
    const boss = (await f.game.summonWorldBoss('boss')).worldBoss!.active!
    await expect(
      f.game.reportCombat('boss', {
        monsterId: f.character.location.monsterId,
        kills: 1,
        deaths: 0,
      }),
    ).rejects.toThrow('wrong-world-boss')
    const report = { monsterId: boss.monsterId, encounterId: boss.id, kills: 1, deaths: 0 }
    await expect(f.game.reportCombat('boss', { ...report, kills: 2 })).rejects.toThrow(
      'invalid-world-boss-result',
    )
    const result = await f.game.reportCombat('boss', report)
    expect(result.drops).toEqual(
      expect.arrayContaining([
        { itemId: 4917, count: 50 },
        { itemId: 4920, count: 50 },
        { itemId: 972, count: 10 },
        { itemId: 2544, count: 25 },
        { itemId: 2547, count: 5 },
        { itemId: 2548, count: 3 },
        { itemId: 95014, count: 1 },
      ]),
    )
    expect(result.character.worldBoss).toMatchObject({
      kills: { 'lc-zone-0': 0 },
      defeated: { 'lc-zone-0': 1 },
      active: null,
    })
    expect(result.character.location).toEqual(f.character.location)
    expect(result.character.stats.monsterKills[boss.monsterId]).toBe(1)
    const saved = f.storage.getItem(SAVE_KEY)
    await expect(f.game.reportCombat('boss', report)).rejects.toThrow('world-boss-expired')
    expect(f.storage.getItem(SAVE_KEY)).toBe(saved)
  })

  it('blocks travel, expeditions and Dungeons during the boss fight', async () => {
    const f = fixture()
    await f.game.load()
    await f.game.summonWorldBoss('boss')
    await expect(f.game.travel('boss', f.character.location)).rejects.toThrow('world-boss-active')
    await expect(f.game.startAfk('boss')).rejects.toThrow('world-boss-active')
    await expect(f.game.startDungeon('boss', 'belfist')).rejects.toThrow('world-boss-active')
    await expect(f.game.deleteCharacter('boss')).rejects.toThrow('world-boss-active')
    const canceled = await f.game.cancelWorldBoss('boss')
    expect(canceled.worldBoss).toMatchObject({
      kills: { 'lc-zone-0': 0 },
      defeated: {},
      active: null,
    })
    await expect(f.game.startAfk('boss')).resolves.toBeTruthy()
  })

  it('ends on death with no boss loot or refund and allows ordinary combat again', async () => {
    const f = fixture()
    await f.game.load()
    const boss = (await f.game.summonWorldBoss('boss')).worldBoss!.active!
    const dead = await f.game.reportCombat('boss', {
      monsterId: boss.monsterId,
      encounterId: boss.id,
      kills: 0,
      deaths: 1,
    })
    expect(dead.drops).toEqual([])
    expect(dead.character.worldBoss).toMatchObject({
      kills: { 'lc-zone-0': 0 },
      defeated: {},
      active: null,
    })
    expect(dead.character.stats.deaths).toBe(1)
    const normal = await f.game.reportCombat('boss', {
      monsterId: f.character.location.monsterId,
      kills: 1,
      deaths: 0,
    })
    expect(worldBossCharge(normal.character)).toBe(1)
  })

  it('interrupts a reload without AFK boss rewards or another charge', async () => {
    const f = fixture()
    await f.game.load()
    const boss = (await f.game.summonWorldBoss('boss')).worldBoss!.active!
    const before = f.read()
    f.clock.now += 3_600_000
    const reloaded = new LocalGameService(f.storage, { now: () => f.clock.now, rng: createRng(2) })
    const c = (await reloaded.load()).save.characters[0]!
    expect(c.worldBoss!.active).toBeNull()
    expect(c.worldBoss!.kills['lc-zone-0']).toBe(0)
    expect(c.location).toEqual(before.location)
    expect(c.inventory).toEqual(before.inventory)
    expect(c.gear).toEqual(before.gear)
    expect(c.gold).toBe(before.gold)
    expect(c.lastPlayedAt).toBe(f.clock.now)
    await expect(
      reloaded.reportCombat('boss', {
        monsterId: boss.monsterId,
        encounterId: boss.id,
        kills: 1,
        deaths: 0,
      }),
    ).rejects.toThrow('world-boss-expired')
    expect((await reloaded.load()).save.characters[0]!.worldBoss!.active).toBeNull()
  })

  it('keeps charge separate per character/map and never earns it from AFK or a Dungeon', async () => {
    const f = fixture(10)
    await f.game.load()
    const other = await f.game.createCharacter({ name: 'SecondBoss', classId: 'mage' })
    expect(worldBossCharge(other)).toBe(0)
    await f.game.startAfk('boss')
    f.clock.now += 60_000
    const afk = await f.game.claimAfk('boss')
    expect(afk.kills).toBeGreaterThan(0)
    expect(worldBossCharge(afk.character)).toBe(10)
    let dungeon = await f.game.startDungeon('boss', 'belfist')
    for (let i = 0; i < 12 && dungeon.run && dungeon.run.score === 0; i++) {
      f.clock.now += 5000
      dungeon = await f.game.advanceDungeon('boss', 5, { x: 0, z: 0 })
    }
    expect(dungeon.run!.score).toBeGreaterThan(0)
    expect(worldBossCharge(dungeon.character)).toBe(10)
    await expect(
      f.game.reportCombat('boss', {
        monsterId: f.character.location.monsterId,
        kills: 1,
        deaths: 0,
      }),
    ).rejects.toThrow('in-dungeon')
    await f.game.finishDungeon('boss')
    expect(worldBossCharge(f.read())).toBe(10)
    // Normal travel persists the prior map's charge rather than resetting it.
    await f.game.dev!.openAllSpots('boss')
    const last = ZONES['lc-zone-0']!.monsterIds.at(-1)!
    await f.game.travel('boss', { zoneId: 'lc-zone-0', monsterId: last })
    await f.game.reportCombat('boss', { monsterId: last, kills: 1, deaths: 0 })
    const dratan = { zoneId: 'lc-zone-4', monsterId: ZONES['lc-zone-4']!.monsterIds[0]! }
    await f.game.travel('boss', dratan)
    const kill = await f.game.reportCombat('boss', {
      monsterId: dratan.monsterId,
      kills: 1,
      deaths: 0,
    })
    expect(kill.character.worldBoss!.kills).toEqual({ 'lc-zone-0': 11, 'lc-zone-4': 1 })
  })
})
