import { describe, expect, it, vi } from 'vitest'

// This feature must be checked on the delivered SQL export, including real buffs and dungeon NPCs.
vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
}))

import { DUNGEONS, DUNGEON_MAX_ENEMIES } from '../data/dungeons.ts'
import { ITEMS } from '../data/items.ts'
import { lcData } from '../data/lcSource.ts'
import { getMonster } from '../data/monsters.ts'
import { getSkill } from '../data/skills.ts'
import { createCharacterData } from './character.ts'
import { effectiveStats, freshFighter, runSpeed, skillMpCost } from './combat.ts'
import { skillRank } from './skills.ts'
import { monsterFighter } from './fighters.ts'
import {
  DUNGEON_BUFFS,
  chooseDungeonBuff,
  createDungeonRun,
  dungeonBuffRank,
  dungeonBuffDefinition,
  dungeonAreaTargets,
  dungeonRunsLeft,
  dungeonStep,
  dungeonXpNeeded,
  sanitizeDungeonProgress,
  type DungeonRun,
} from './dungeons.ts'
import { createDefaultSave, loadSave, serializeSave } from './save.ts'
import { createRng } from './rng.ts'
import { LocalGameService, SAVE_KEY } from '../service/LocalGameService.ts'
import type { KeyValueStorage } from '../service/GameService.ts'

const NOW = Date.UTC(2026, 10, 6, 12)
const rng = () => createRng(513)
const hero = (level = 30) => ({
  ...createCharacterData({ name: 'DungeonHero', classId: 'healer' }, 'd', NOW),
  level,
})
const run = () => createDungeonRun(hero(), 'belfist', 'round', NOW)
const STILL = { x: 0, z: 0 }

function enemyAt(state: DungeonRun, x: number, hp = 1) {
  const fighter = freshFighter(monsterFighter('lc-35'))
  fighter.hp = hp
  fighter.cooldown = 100
  return { uid: state.nextUid++, monsterId: 'lc-35', x, z: 0, fighter, deadFor: -1 }
}

function fixture(level = 30) {
  let time = NOW
  let value: string | null = serializeSave({
    ...createDefaultSave(NOW),
    activeCharacterId: 'd',
    characters: [hero(level)],
  })
  const storage: KeyValueStorage = {
    getItem: () => value,
    setItem: (_, next) => {
      value = next
    },
    removeItem: () => {
      value = null
    },
  }
  const service = new LocalGameService(storage, { now: () => time, rng: rng() })
  return {
    service,
    storage,
    now: () => time,
    day: () => {
      time += 86400000
    },
    tick: (n: number) => {
      time += n * 1000
    },
    read: () => JSON.parse(value!).characters[0] as ReturnType<typeof hero>,
  }
}

describe('dungeons on the original database', () => {
  it('uses exactly the three original spawn rosters and the owner’s entry levels', () => {
    expect(DUNGEONS.map((d) => [d.zoneId, d.minLevel])).toEqual([
      ['lc-zone-1', 1],
      ['lc-zone-3', 15],
      ['lc-zone-9', 30],
    ])
    expect(DUNGEONS.map((d) => d.monsterIds.length)).toEqual([7, 6, 10])
    for (const d of DUNGEONS)
      for (const id of d.monsterIds) {
        const source = lcData!.monsters.find((m) => m.id === id)!
        const monster = getMonster(id)
        expect(source.zones).toContain(d.zoneId)
        expect(monster.stats.maxHp).toBe(source.hp)
        expect(monster.stats.defense).toBe(source.defense)
        expect(monster.exp).toBe(source.exp)
        expect(monster.sp).toBe(source.sp)
        expect(monster.gold).toBe(source.gold)
        expect(monster.dropSlots).toHaveLength(20)
        expect(monster.modelId).toBe(source.model)
      }
  })

  it('does not scale source monsters down to the lower entry level', () => {
    const state = createDungeonRun(hero(1), 'belfist', 'low', NOW)
    const next = dungeonStep(state, 0.05, STILL, rng()).run
    expect(next.enemies[0]!.fighter.level).toBe(10)
    expect(next.enemies[0]!.fighter.stats.maxHp).toBe(getMonster('lc-35').stats.maxHp)
  })

  it('scores kills but grants dungeon experience only on collecting crystals', () => {
    const state = run()
    state.player.stats = {
      ...state.player.stats,
      attack: 1000000,
      physicalAttack: 1000000,
      hit: 100000,
      physicalHit: 100000,
      attackRange: 20,
    }
    const enemy = enemyAt(state, 8)
    state.enemies = [enemy]
    state.targetUid = enemy.uid
    state.player.impactIn = 0.01
    const next = dungeonStep(state, 0.05, STILL, rng()).run
    expect(next.score).toBe(1)
    expect(next.xp).toBe(0)
    expect(next.crystals).toHaveLength(1)
    next.position = { x: next.crystals[0]!.x, z: 0 }
    next.crystals[0]!.value = dungeonXpNeeded(1)
    const picked = dungeonStep(next, 0.05, STILL, rng()).run
    expect(picked.level).toBe(2)
    expect(picked.crystals).toHaveLength(0)
    expect(picked.choices).toHaveLength(3)
  })

  it('offers three distinct, existing, cross-class buffs including high ranks', () => {
    expect(DUNGEON_BUFFS.length).toBeGreaterThanOrEqual(19)
    expect(new Set(DUNGEON_BUFFS.map((id) => dungeonBuffDefinition(id)!.classId)).size).toBe(6)
    expect(
      DUNGEON_BUFFS.some((id) => dungeonBuffDefinition(id)!.levels.at(-1)!.learnLevel > 30),
    ).toBe(true)
    const state = run()
    state.xp = 100000
    let next = dungeonStep(state, 0.05, STILL, rng()).run
    expect(next.level).toBe(20)
    const roll = rng()
    while (next.choices.length) {
      expect(new Set(next.choices).size).toBe(3)
      expect(next.choices.every((id) => !next.buffs.includes(id))).toBe(true)
      next = chooseDungeonBuff(next, next.choices[0]!, roll)
    }
    expect(next.buffs).toHaveLength(19)
    expect(new Set(next.buffs).size).toBe(19)
    expect(next.player.effects).toHaveLength(19)
    for (const effect of next.player.effects) {
      expect(effect.stats).toEqual(
        dungeonBuffRank(effect.skillId).effects.filter((e) => e.kind === 'stat'),
      )
      expect(effect.remaining).toBeCloseTo(600 - next.elapsed)
    }
    expect(dungeonStep(next, 0.05, STILL, roll).run.level).toBe(20)
    expect(() => chooseDungeonBuff(next, next.buffs[0]!, roll)).toThrow('dungeon-buff-not-offered')
  })

  it('freezes timers, movement, HP, enemies and RNG during a choice', () => {
    const state = run()
    state.choices = DUNGEON_BUFFS.slice(0, 3)
    const roll = vi.fn(rng())
    const next = dungeonStep(state, 0.05, { x: 1, z: 1 }, roll)
    expect(next.run).toBe(state)
    expect(next.kills).toEqual([])
    expect(roll).not.toHaveBeenCalled()
  })

  it('uses the client’s area cone and target cap, paying a multi-target cast only once', () => {
    const state = run()
    const skill = getSkill(28)!
    const rank = skillRank(skill, skill.levels.at(-1)!.level)
    state.player.stats = {
      ...state.player.stats,
      maxMp: 10000,
      attack: 100000,
      physicalAttack: 100000,
      hit: 100000,
      physicalHit: 100000,
    }
    state.player.mp = 10000
    state.player.skills = []
    const primary = enemyAt(state, 3, 1000000)
    state.enemies = [
      primary,
      ...Array.from({ length: 10 }, (_, i) => ({
        ...enemyAt(state, 4 + i * 0.1, 1000000),
        z: 0.1,
      })),
    ]
    const behind = enemyAt(state, -3, 1000000)
    state.enemies.push(behind)
    const extras = dungeonAreaTargets(state, primary, rank)
    expect(extras).toHaveLength(skill.levels.at(-1)!.targetMax! - 1)
    expect(extras.some((e) => e.uid === behind.uid)).toBe(false)
    state.player.casting = rank
    state.player.impactIn = 0.01
    state.targetUid = primary.uid
    const next = dungeonStep(state, 0.05, STILL, () => 0.5)
    expect(next.run.player.mp).toBe(10000 - skillMpCost(rank, state.player.stats))
    const hits = next.events.filter(
      ({ event }) => event.type === 'hit' && event.target === 'monster' && event.skill,
    )
    expect(hits).toHaveLength(skill.levels.at(-1)!.targetMax!)
  })

  it('normalizes diagonal input, uses real run speed and respects the arena boundary', () => {
    const state = run()
    const speed = runSpeed(effectiveStats(state.player))
    const next = dungeonStep(state, 0.05, { x: 1, z: 1 }, rng()).run
    expect(Math.hypot(next.position.x, next.position.z)).toBeCloseTo(speed * 0.05)
    expect(state.position).toEqual(STILL)
    next.position.x = 26.49
    next.position.z = 0
    expect(dungeonStep(next, 0.05, { x: 1, z: 0 }, rng()).run.position.x).toBeCloseTo(26.5)
  })

  it('ticks the hero once regardless of the number of enemies and bounds the crowd', () => {
    const state = run()
    state.player.skillCooldowns[999] = 10
    state.enemies = Array.from({ length: DUNGEON_MAX_ENEMIES }, (_, i) =>
      enemyAt(state, 8 + i * 0.1, 1000),
    )
    const next = dungeonStep(state, 0.05, STILL, rng()).run
    expect(next.player.skillCooldowns[999]).toBeCloseTo(9.95)
    expect(next.enemies.filter((e) => e.fighter.hp > 0)).toHaveLength(DUNGEON_MAX_ENEMIES)
  })

  it('keeps each monster’s hate toward the hero and the elementals separate', () => {
    const state = run()
    state.player.cooldown = 100
    state.player.skills = []
    state.player.summons = [
      {
        element: 0,
        name: 'Fire Elemental',
        level: 30,
        stats: { ...state.player.stats },
        hp: 100,
        cooldown: 100,
        impactIn: null,
        remaining: 100,
        recoveryIn: 3,
        hate: 0,
      },
    ]
    const a = enemyAt(state, 1.8, 100000),
      b = enemyAt(state, -1.8, 100000)
    a.fighter.cooldown = b.fighter.cooldown = 0
    const first = { ...a, hate: { player: 100, summons: { 0: 0 } } }
    const second = { ...b, hate: { player: 0, summons: { 0: 10 } } }
    state.enemies = [first, second]
    const next = dungeonStep(state, 0.05, STILL, rng()).run
    expect(next.enemies.find((e) => e.uid === a.uid)!.fighter.aimAt).toBeUndefined()
    expect(next.enemies.find((e) => e.uid === b.uid)!.fighter.aimAt).toBe(0)
    expect(state.enemies[0]!.hate!.player).toBe(100)
  })

  it('ends at exactly 600 active seconds without another wave or bonus time', () => {
    const state = run()
    state.elapsed = 599.98
    state.wave = 20
    const next = dungeonStep(state, 0.05, STILL, rng()).run
    expect(next.elapsed).toBe(600)
    expect(next.ended).toBe('completed')
    expect(dungeonStep(next, 0.05, STILL, rng()).run).toBe(next)
  })
})

describe('saved dungeon commands', () => {
  it('enforces levels and two entries per dungeon, per character and UTC day, including quits', async () => {
    const f = fixture(14)
    await f.service.load()
    await expect(f.service.startDungeon('d', 'procyon')).rejects.toThrow('dungeon-level')
    for (let n = 0; n < 2; n++) {
      await f.service.startDungeon('d', 'belfist')
      await f.service.finishDungeon('d')
    }
    await expect(f.service.startDungeon('d', 'belfist')).rejects.toThrow('dungeon-daily-limit')
    const other = await f.service.createCharacter({ name: 'OtherHero', classId: 'knight' })
    expect((await f.service.startDungeon(other.id, 'belfist')).run?.level).toBe(1)
    await f.service.finishDungeon(other.id)
    f.day()
    expect((await f.service.startDungeon('d', 'belfist')).run?.level).toBe(1)
    expect(f.read().dungeons!.entries.belfist).toBe(1)
    expect(dungeonRunsLeft(f.read(), 'procyon', f.now())).toBe(2)
  })

  it('locks gear and field/AFK commands in the service while leaving skill toggles usable', async () => {
    const f = fixture()
    await f.service.load()
    const started = await f.service.startDungeon('d', 'belfist')
    const worn = started.character.equipment
    await expect(f.service.equipItem('d', { itemId: 1 })).rejects.toThrow('in-dungeon')
    await expect(f.service.unequipItem('d', 'weapon')).rejects.toThrow('in-dungeon')
    await expect(f.service.upgradeItem('d', 'weapon')).rejects.toThrow('in-dungeon')
    await expect(f.service.identifyItems('d', 1084, [])).rejects.toThrow('in-dungeon')
    await expect(f.service.startAfk('d')).rejects.toThrow('in-dungeon')
    await expect(f.service.travel('d', started.character.location)).rejects.toThrow('in-dungeon')
    await expect(
      f.service.reportCombat('d', { monsterId: 'lc-35', kills: 1, deaths: 0 }),
    ).rejects.toThrow('in-dungeon')
    await expect(f.service.setActiveCharacter(null)).rejects.toThrow('in-dungeon')
    const skillId = started.character.skillBar[0]!
    await f.service.setSkillAuto('d', skillId, false)
    expect(f.read().equipment).toEqual(worn)
    await f.service.finishDungeon('d')
    await expect(f.service.unequipItem('d', 'weapon')).resolves.toBeTruthy()
  })

  it('consumes a real potion once, clears temporary effects and cannot refund the entry on reload', async () => {
    const f = fixture()
    await f.service.load()
    const potion = Object.values(ITEMS).find((i) => i.potion?.kind === 'boost' && i.level <= 30)!
    expect(potion).toBeTruthy()
    await f.service.buyItem('d', potion.id, 1).catch(async () => {
      await f.service.dev.addGold('d', 10000000)
      await f.service.buyItem('d', potion.id, 1)
    })
    await f.service.startDungeon('d', 'belfist')
    const used = await f.service.drinkDungeonPotion('d', potion.id)
    expect(used.run!.player.effects.some((e) => e.itemId === potion.id)).toBe(true)
    expect(used.character.inventory.some((i) => i.itemId === potion.id)).toBe(false)
    const restored = new LocalGameService(f.storage, { now: f.now, rng: rng() })
    const save = await restored.load()
    const c = save.save.characters[0]!
    expect(c.boosts).toEqual([])
    expect(c.dungeons!.active).toBeNull()
    expect(c.dungeons!.entries.belfist).toBe(1)
    expect(c.dungeons!.history[0]!.outcome).toBe('interrupted')
    await restored.load()
    expect(f.read().dungeons!.history).toHaveLength(1)
    await restored.startDungeon('d', 'belfist')
    await restored.finishDungeon('d')
    await expect(restored.startDungeon('d', 'belfist')).rejects.toThrow('dungeon-daily-limit')
  })

  it('migrates v14 without losing progression and repairs absent dungeon records', () => {
    const c = hero(30)
    c.gold = 123456
    const save = {
      ...createDefaultSave(NOW),
      saveVersion: 14,
      characters: [c],
      activeCharacterId: c.id,
    }
    delete save.characters[0]!.dungeons
    const loaded = loadSave(JSON.stringify(save), NOW)
    expect(loaded.status).toBe('migrated')
    expect(loaded.save.characters[0]).toMatchObject({
      level: 30,
      gold: 123456,
      equipment: c.equipment,
    })
    expect(loaded.save.characters[0]!.dungeons!.active).toBeNull()
    expect(
      sanitizeDungeonProgress({
        active: { seconds: Infinity },
        entries: { belfist: 100 },
        history: [null],
      }),
    ).toMatchObject({ active: null, entries: { belfist: 2 }, history: [] })
  })

  it.each(DUNGEONS)(
    'resolves a $id round through source combat and saves score, death and rewards exactly once',
    async (dungeon) => {
      const f = fixture(80)
      const character = f.read()
      for (const slot of ['weapon', 'helmet', 'armor', 'pants', 'gloves', 'boots'] as const) {
        const item = Object.values(ITEMS)
          .filter(
            (i) => i.gear?.slot === slot && i.gear.classes.includes('healer') && i.level <= 80,
          )
          .sort((a, b) => b.level - a.level)[0]!
        character.equipment[slot] = { uid: slot, itemId: item.id, plus: 15 }
      }
      f.storage.setItem(
        SAVE_KEY,
        serializeSave({
          ...createDefaultSave(NOW),
          activeCharacterId: character.id,
          characters: [character],
        }),
      )
      await f.service.load()
      let update = await f.service.startDungeon('d', dungeon.id)
      let calls = 0
      while (update.run && calls++ < 1600) {
        if (update.run.choices.length)
          update = await f.service.chooseDungeonBuff('d', update.run.choices[0]!)
        else {
          const p = update.run.position
          const closest = [...update.run.crystals].sort(
            (a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
          )[0]
          f.tick(0.5)
          update = await f.service.advanceDungeon(
            'd',
            0.5,
            closest ? { x: closest.x - p.x, z: closest.z - p.z } : STILL,
          )
        }
      }
      expect(['completed', 'defeated']).toContain(update.result?.outcome)
      if (update.result!.outcome === 'completed') expect(update.result!.seconds).toBe(600)
      else {
        expect(update.result!.seconds).toBeLessThan(600)
        expect(update.character.stats.deaths).toBe(character.stats.deaths + 1)
        expect(update.result!.lost).toEqual({ exp: 0, sp: 0 })
      }
      expect(update.result!.score).toBeGreaterThan(0)
      if (update.result!.outcome === 'completed') expect(update.result!.score).toBeGreaterThan(100)
      expect(update.result!.score).toBeLessThanOrEqual(290)
      expect(update.character.stats.kills - character.stats.kills).toBe(update.result!.score)
      expect(update.character.gold - character.gold).toBe(update.result!.gold)
      expect(update.character.sp - character.sp).toBe(update.result!.sp - update.result!.lost.sp)
      expect(update.character.dungeons!.history).toHaveLength(1)
      expect(update.character.dungeons!.best[dungeon.id]!.score).toBe(update.result!.score)
      expect(update.character.boosts).toEqual([])
      const reloaded = await new LocalGameService(f.storage, { now: f.now }).load()
      expect(reloaded.save.characters[0]!.gold).toBe(update.character.gold)
      expect(reloaded.save.characters[0]!.dungeons!.history).toHaveLength(1)
      await expect(f.service.finishDungeon('d')).rejects.toThrow('no-dungeon')
    },
    30000,
  )
})
