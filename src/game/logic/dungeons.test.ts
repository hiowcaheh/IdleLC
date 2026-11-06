import { describe, expect, it, vi } from 'vitest'

// This feature must be checked on the delivered SQL export, including real buffs and dungeon NPCs.
vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
}))

import {
  DUNGEONS,
  DUNGEON_MAX_ENEMIES,
  DUNGEON_NEXT_WAVE_DELAY,
  dungeonWaveSize,
} from '../data/dungeons.ts'
import { ITEMS } from '../data/items.ts'
import { lcData } from '../data/lcSource.ts'
import { getMonster } from '../data/monsters.ts'
import { getSkill } from '../data/skills.ts'
import { createCharacterData } from './character.ts'
import { effectiveStats, freshFighter, runSpeed, skillMpCost } from './combat.ts'
import { skillRank } from './skills.ts'
import { rewardKills } from './rewards.ts'
import { monsterFighter } from './fighters.ts'
import {
  DUNGEON_BUFFS,
  DUNGEON_SUPER_BUFFS,
  dungeonChoiceLevel,
  dungeonSuperBuffDefinition,
  dungeonSuperEffect,
  dungeonRewardMultipliers,
  chooseDungeonBuff,
  createDungeonRun,
  dungeonBuffRank,
  dungeonBuffDefinition,
  dungeonBuffLevel,
  dungeonCheckpoint,
  emptyDungeonProgress,
  recordDungeon,
  upgradeDungeonBuff,
  DUNGEON_BUFF_UPGRADE_COST,
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

function fixture(level = 30, patch: Partial<ReturnType<typeof hero>> = {}) {
  let time = NOW
  let value: string | null = serializeSave({
    ...createDefaultSave(NOW),
    activeCharacterId: 'd',
    characters: [{ ...hero(level), ...patch }],
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

  it('offers distinct cross-class buffs at rank one, including advanced class definitions', () => {
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
    const superOffers: [number, number][] = []
    while (next.choices.length) {
      const special = !!dungeonSuperBuffDefinition(next.choices[0]!)
      if (special) superOffers.push([dungeonChoiceLevel(next), next.choices.length])
      expect(new Set(next.choices).size).toBe(next.choices.length)
      if (!special) expect(next.choices).toHaveLength(3)
      expect(next.choices.every((id) => !next.buffs.includes(id))).toBe(true)
      next = chooseDungeonBuff(next, next.choices[0]!, roll)
    }
    expect(next.buffs).toHaveLength(19)
    expect(new Set(next.buffs).size).toBe(19)
    expect(next.player.effects).toHaveLength(19)
    expect(superOffers).toEqual([
      [5, 4],
      [10, 3],
      [15, 2],
      [20, 1],
    ])
    expect(DUNGEON_BUFFS.every((id) => dungeonBuffRank(id).level === 1)).toBe(true)
    for (const effect of next.player.effects) {
      const special = DUNGEON_SUPER_BUFFS.find((b) =>
        b.itemId !== undefined ? b.itemId === effect.itemId : b.skillId === effect.skillId,
      )
      expect(effect.stats).toEqual(
        special
          ? dungeonSuperEffect(special, 600, next.player.stats.clientContext?.classId).stats
          : dungeonBuffRank(effect.skillId).effects.filter((e) => e.kind === 'stat'),
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

  it('sends twice the old wave size and the next wave 5 s after a clear, repeating wave 20', () => {
    expect(dungeonWaveSize(1)).toBe(10)
    expect(dungeonWaveSize(20)).toBe(48)
    let state = dungeonStep(run(), 0.05, STILL, rng()).run
    expect(state.wave).toBe(1)
    expect(state.remainingSpawns + state.enemies.length).toBe(10)
    // the wave is cleared early (all spawned and down): 5 s later the next one comes
    state = { ...state, remainingSpawns: 0, enemies: [] }
    const steps = Math.round(DUNGEON_NEXT_WAVE_DELAY / 0.05)
    for (let i = 0; i < steps - 1; i++) state = dungeonStep(state, 0.05, STILL, rng()).run
    expect(state.wave).toBe(1)
    state = dungeonStep(state, 0.05, STILL, rng()).run
    expect(state.wave).toBe(2)
    expect(state.elapsed).toBeLessThan(10)
    // a monster left stops the countdown; the 30 s schedule still brings the wave
    state = { ...state, wave: 20, remainingSpawns: 0, enemies: [], nextWaveIn: 0.04 }
    state = dungeonStep(state, 0.05, STILL, rng()).run
    expect(state.wave).toBe(20)
    expect(state.remainingSpawns + state.enemies.length).toBe(48)
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

describe('per-character Buffer and lifetime dungeon points', () => {
  const buff = DUNGEON_BUFFS.find((id) => dungeonBuffDefinition(id)!.levels.length > 1)!
  const completed = (id = 'complete', score = 100) => ({
    ...dungeonCheckpoint(run()),
    runId: id,
    seconds: 600,
    score,
    outcome: 'completed' as const,
    endedAt: NOW,
  })

  it('credits completed rounds once, spends only the wallet, and accumulates future scores', () => {
    const first = recordDungeon(emptyDungeonProgress(), completed())
    expect(first).toMatchObject({ points: 100, totalPoints: 100 })
    const upgraded = upgradeDungeonBuff({ ...hero(), dungeons: first }, buff)
    expect(upgraded.dungeons).toMatchObject({
      points: 100 - DUNGEON_BUFF_UPGRADE_COST,
      totalPoints: 100,
      buffLevels: { [buff]: 2 },
    })
    expect(first.points).toBe(100)
    const second = recordDungeon(upgraded.dungeons!, completed('second', 37))
    expect(second).toMatchObject({ points: 137 - DUNGEON_BUFF_UPGRADE_COST, totalPoints: 137 })
    expect(recordDungeon(second, completed('second', 37))).toEqual(second)
    let many = second
    for (let n = 0; n < 35; n++) many = recordDungeon(many, completed(`later-${n}`, 1))
    expect(many.history).toHaveLength(30)
    expect(sanitizeDungeonProgress(many)).toMatchObject({
      points: 172 - DUNGEON_BUFF_UPGRADE_COST,
      totalPoints: 172,
    })
    for (const outcome of ['left', 'interrupted', 'defeated'] as const) {
      const progress = recordDungeon(second, { ...completed(outcome, 75), outcome })
      expect(progress.points).toBe(second.points)
      expect(progress.totalPoints).toBe(second.totalPoints)
    }
  })

  it('freezes purchased ranks on entry and applies exactly that source rank on selection', () => {
    const character = {
      ...hero(),
      dungeons: { ...emptyDungeonProgress(), points: 100, totalPoints: 100 },
    }
    const upgraded = upgradeDungeonBuff(character, buff)
    const fresh = createDungeonRun(character, 'belfist', 'fresh', NOW)
    const trained = createDungeonRun(upgraded, 'belfist', 'trained', NOW)
    expect(dungeonBuffLevel(character.dungeons, buff)).toBe(1)
    expect(trained.buffLevels[buff]).toBe(2)
    for (const [state, rank] of [
      [fresh, 1],
      [trained, 2],
    ] as const) {
      state.pendingLevels = 1
      state.choices = [buff]
      const chosen = chooseDungeonBuff(state, buff, rng())
      expect(chosen.player.effects[0]!.stats).toEqual(
        dungeonBuffRank(buff, rank).effects.filter((e) => e.kind === 'stat'),
      )
    }
    upgraded.dungeons!.buffLevels[buff] = 3
    expect(trained.buffLevels[buff]).toBe(2)
  })

  it('validates funds, maximum rank and allowed buffs without spending on rejection', () => {
    const character = { ...hero(), dungeons: emptyDungeonProgress() }
    expect(() => upgradeDungeonBuff(character, buff)).toThrow('dungeon-points')
    character.dungeons.points = character.dungeons.totalPoints = 1000
    character.dungeons.buffLevels[buff] = dungeonBuffDefinition(buff)!.levels.at(-1)!.level
    expect(() => upgradeDungeonBuff(character, buff)).toThrow('dungeon-buff-max')
    expect(() => upgradeDungeonBuff(character, -1)).toThrow('unknown-dungeon-buff')
    expect(character.dungeons.points).toBe(1000)
  })

  it('persists upgrades per character, prevents buying inside a run, and preserves points over reset', async () => {
    const f = fixture(30, {
      dungeons: { ...emptyDungeonProgress(), points: 100, totalPoints: 100 },
    })
    await f.service.load()
    const other = await f.service.createCharacter({ name: 'BufferOther', classId: 'knight' })
    expect(other.dungeons).toMatchObject({ points: 0, totalPoints: 0, buffLevels: {} })
    await expect(f.service.upgradeDungeonBuff(other.id, buff)).rejects.toThrow('dungeon-points')
    await f.service.upgradeDungeonBuff('d', buff)
    const stored = f.read().dungeons!
    expect(stored).toMatchObject({ points: 0, totalPoints: 100, buffLevels: { [buff]: 2 } })
    const entered = await f.service.startDungeon('d', 'belfist')
    expect(entered.run!.buffLevels[buff]).toBe(2)
    await expect(f.service.upgradeDungeonBuff('d', buff)).rejects.toThrow('in-dungeon')
    const reloaded = new LocalGameService(f.storage, { now: f.now, rng: rng() })
    const recovered = await reloaded.load()
    expect(recovered.save.characters[0]!.dungeons).toMatchObject({
      points: 0,
      totalPoints: 100,
      buffLevels: { [buff]: 2 },
      active: null,
    })
    f.day()
    await reloaded.startDungeon('d', 'belfist')
    expect(f.read().dungeons).toMatchObject({
      points: 0,
      totalPoints: 100,
      buffLevels: { [buff]: 2 },
    })
  })

  it('migrates v15 recorded completions once and rejects malformed wallet and buff levels', () => {
    const legacy = {
      ...emptyDungeonProgress(),
      history: [completed('legacy', 121), { ...completed('quit', 19), outcome: 'left' as const }],
    }
    const old = Object.fromEntries(
      Object.entries(legacy).filter(
        ([key]) => !['points', 'totalPoints', 'buffLevels'].includes(key),
      ),
    )
    const raw = {
      ...createDefaultSave(NOW),
      saveVersion: 15,
      characters: [{ ...hero(), dungeons: old }],
    }
    const migrated = loadSave(JSON.stringify(raw), NOW)
    expect(migrated.status).toBe('migrated')
    expect(migrated.save.characters[0]!.dungeons).toMatchObject({
      points: 121,
      totalPoints: 121,
      buffLevels: {},
    })
    const next = loadSave(serializeSave(migrated.save), NOW)
    expect(next.save.characters[0]!.dungeons).toEqual(migrated.save.characters[0]!.dungeons)
    expect(
      sanitizeDungeonProgress({
        ...legacy,
        points: Infinity,
        totalPoints: -5,
        buffLevels: { [buff]: 9999, '-1': 3 },
      }),
    ).toMatchObject({ points: 121, totalPoints: 121, buffLevels: {} })
    expect(sanitizeDungeonProgress({ ...legacy, points: 500, totalPoints: 121 }).points).toBe(121)
  })
})

describe('fixed dungeon super blessings and potion timers', () => {
  it('uses source powers and the requested artifact override, keeps supers out of the Buffer, and ignores dummy attack magic', () => {
    expect(DUNGEON_SUPER_BUFFS.map((b) => b.id)).toEqual([-1416, -2453, -1075, -10953])
    const iris = dungeonSuperBuffDefinition(-1416)!
    const pill = dungeonSuperBuffDefinition(-2453)!
    expect([iris.level, iris.rewards!.exp, pill.rewards!.sp]).toEqual([2, 200, 200])
    expect(dungeonSuperEffect(iris, 600).stats).toEqual([])
    expect(dungeonSuperEffect(pill, 600).stats).toEqual([])
    expect(dungeonSuperEffect(dungeonSuperBuffDefinition(-1075)!, 600).stats).toEqual([
      { kind: 'stat', stat: 'deadly', value: 200, percent: true },
      { kind: 'stat', stat: 'attack', value: 200, percent: true },
      { kind: 'stat', stat: 'magicAttack', value: 200, percent: true },
    ])
    const artifact = dungeonSuperBuffDefinition(-10953)!
    expect(artifact).toMatchObject({
      name: 'Artifact of Seraphim',
      attributes: 1200,
      rewards: { exp: 1200, sp: 1200, gold: 800, drop: 300 },
      visual: 'Angel_wing03',
    })
    for (const def of DUNGEON_SUPER_BUFFS) {
      expect(() =>
        upgradeDungeonBuff(
          { ...hero(), dungeons: { ...emptyDungeonProgress(), points: 10000, totalPoints: 10000 } },
          def.id,
        ),
      ).toThrow('unknown-dungeon-buff')
    }
  })

  it('applies successive source reward multipliers to actual payouts and leaves ordinary rewards unchanged', () => {
    const state = run()
    state.player.effects = DUNGEON_SUPER_BUFFS.map((b) => dungeonSuperEffect(b, 600))
    expect(dungeonRewardMultipliers(state)).toEqual({ exp: 39, sp: 39, gold: 9, drop: 4 })
    const character = hero(10)
    const monster = getMonster('lc-35')
    const base = rewardKills(character, monster, 1, rng(), NOW)
    const artifactOnly = {
      ...state,
      player: {
        ...state.player,
        effects: [dungeonSuperEffect(dungeonSuperBuffDefinition(-10953)!, 600)],
      },
    }
    const artifactMultipliers = dungeonRewardMultipliers(artifactOnly)
    expect(artifactMultipliers).toEqual({ exp: 13, sp: 13, gold: 9, drop: 4 })
    const artifactPayout = rewardKills(character, monster, 1, rng(), NOW, artifactMultipliers)
    expect([artifactPayout.exp, artifactPayout.sp, artifactPayout.gold]).toEqual([
      base.exp * 13,
      base.sp * 13,
      base.gold * 9,
    ])
    const boosted = rewardKills(character, monster, 1, rng(), NOW, dungeonRewardMultipliers(state))
    expect(boosted.exp).toBe(base.exp * 39)
    expect(boosted.sp).toBe(base.sp * 39)
    expect(boosted.gold).toBe(base.gold * 9)
    const defaultDrops = rewardKills(character, monster, 1, rng(), NOW, {
      ...dungeonRewardMultipliers(state),
      drop: 1,
    })
    expect(defaultDrops.drops).toEqual(base.drops)
    state.player.effects.forEach((e) => {
      e.remaining = 0
    })
    expect(dungeonRewardMultipliers(state)).toEqual({ exp: 1, sp: 1, gold: 1, drop: 1 })
  })

  it('applies the artifact owner HP/MP coefficients together with its four flat attributes', () => {
    const state = run()
    const before = effectiveStats(state.player)
    state.level = 5
    state.pendingLevels = 1
    state.choices = [-10953]
    const next = chooseDungeonBuff(state, -10953, rng())
    const after = effectiveStats(next.player)
    // Source Healer: CON HP coefficient 7, INT/CON MP coefficients 9 and 2.
    expect(after.maxHp - before.maxHp).toBe(1200 * 7)
    expect(after.maxMp! - before.maxMp!).toBe(1200 * 11)
    expect(after.strength! - before.strength!).toBe(1200)
    expect(after.intelligence! - before.intelligence!).toBe(1200)
    expect(after.client!.magicAttack - before.client!.magicAttack).toBe(800)
  })

  it('keeps personal potion duration on entry and near the end while a selected blessing expires with the round', () => {
    const state = createDungeonRun(
      { ...hero(), boosts: [{ itemId: 2138, remaining: 3300 }] },
      'belfist',
      'timers',
      NOW,
    )
    expect(state.player.effects[0]!.remaining).toBe(3300)
    state.elapsed = 590
    state.pendingLevels = 1
    state.choices = [DUNGEON_BUFFS[0]!]
    const blessed = chooseDungeonBuff(state, state.choices[0]!, rng())
    expect(blessed.player.effects.find((e) => e.dungeon)!.remaining).toBe(10)
    const next = dungeonStep(blessed, 0.05, STILL, rng()).run
    expect(next.player.effects.find((e) => e.itemId === 2138)!.remaining).toBeCloseTo(3299.95)
    expect(next.player.effects.find((e) => e.dungeon)!.remaining).toBeCloseTo(9.95)
  })

  it('uses an absolute potion deadline during pauses without advancing the dungeon clock', async () => {
    const f = fixture(30, { inventory: [{ itemId: 2845, count: 1 }] })
    await f.service.load()
    await f.service.startDungeon('d', 'belfist')
    const used = await f.service.drinkDungeonPotion('d', 2845)
    const until = used.character.boosts![0]!.until!
    expect(until).toBe(NOW + 3600000)
    f.tick(120)
    const paused = await f.service.advanceDungeon('d', 0, STILL)
    expect(paused.run!.elapsed).toBe(0)
    expect(paused.run!.player.effects.find((e) => e.itemId === 2845)!.remaining).toBe(3480)
    expect(paused.character.boosts![0]!.until).toBe(until)
    f.tick(3600)
    const expired = await f.service.advanceDungeon('d', 0, STILL)
    expect(expired.run!.player.effects.some((e) => e.itemId === 2845)).toBe(false)
    expect(expired.character.boosts).toEqual([])
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

  it("the developer tool gives back the day's entries", async () => {
    const f = fixture(14)
    await f.service.load()
    for (let n = 0; n < 2; n++) {
      await f.service.startDungeon('d', 'belfist')
      await f.service.finishDungeon('d')
    }
    expect(dungeonRunsLeft(f.read(), 'belfist', f.now())).toBe(0)
    await f.service.dev!.resetDungeonEntries('d')
    expect(dungeonRunsLeft(f.read(), 'belfist', f.now())).toBe(2)
    expect(f.read().dungeons!.history).toHaveLength(2)
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

  it('consumes a long potion once, preserves its source duration over reload and cannot refund the entry', async () => {
    const f = fixture()
    await f.service.load()
    const potion = ITEMS[2138]!
    expect(potion).toBeTruthy()
    await f.service.buyItem('d', potion.id, 1).catch(async () => {
      await f.service.dev.addGold('d', 10000000)
      await f.service.buyItem('d', potion.id, 1)
    })
    await f.service.startDungeon('d', 'belfist')
    const used = await f.service.drinkDungeonPotion('d', potion.id)
    expect(used.run!.player.effects.some((e) => e.itemId === potion.id)).toBe(true)
    expect(used.run!.player.effects.find((e) => e.itemId === potion.id)!.remaining).toBe(3600)
    expect(used.character.inventory.some((i) => i.itemId === potion.id)).toBe(false)
    const restored = new LocalGameService(f.storage, { now: f.now, rng: rng() })
    const save = await restored.load()
    const c = save.save.characters[0]!
    expect(c.boosts).toEqual([{ itemId: potion.id, remaining: 3600 }])
    expect(c.dungeons!.active).toBeNull()
    expect(c.dungeons!.entries.belfist).toBe(1)
    expect(c.dungeons!.history[0]!.outcome).toBe('interrupted')
    await restored.load()
    expect(f.read().dungeons!.history).toHaveLength(1)
    await restored.startDungeon('d', 'belfist')
    const finished = await restored.finishDungeon('d')
    expect(finished.character.boosts).toEqual([{ itemId: potion.id, remaining: 3600 }])
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
      // waves come as soon as they are cleared now, but never more than one spawn per 0.65 s
      expect(update.result!.score).toBeLessThanOrEqual(Math.ceil(600 / 0.65))
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
