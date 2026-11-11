import { allocateStatPoint, sanitizeAllocatedStats } from '../logic/statPoints.ts'
import {
  beginLacaBall,
  finishLacaBall,
  type LacaBallStart,
  type LacaBallResult,
} from '../logic/lacaball.ts'
import {
  createDungeonRun,
  dailyProgress,
  dungeonCheckpoint,
  dungeonStep,
  dungeonRewardMultipliers,
  chooseDungeonBuff,
  upgradeDungeonBuff,
  recordDungeon,
  type DungeonPoint,
  type DungeonRun,
  type DungeonUpdate,
  type DungeonEvent,
  type DungeonEnd,
} from '../logic/dungeons.ts'
import { dungeonPotionBoosts, expireDungeonPotions } from '../logic/dungeonPotions.ts'
import type { DungeonId } from '../data/dungeons.ts'
import { drinkPotion, updatePlayer } from '../logic/combat.ts'
import { playerFighter, potionSupply } from '../logic/fighters.ts'
import { getItem } from '../data/items.ts'
import { rewardKills } from '../logic/rewards.ts'
import type { AttributeKey } from '../logic/attributes.ts'
import { MONSTERS } from '../data/monsters.ts'
import { MAX_LEVEL } from '../data/progression.ts'
import { getTitle } from '../data/titles.ts'
import { ZONES } from '../data/zones.ts'
import { clamp } from '../logic/balance.ts'
import {
  GameError,
  checkNewCharacter,
  createCharacterData,
  type CharacterData,
  type CharacterLocation,
  type NewCharacter,
} from '../logic/character.ts'
import { AFK_MIN_SECONDS, simulateAfk, type AfkResult } from '../logic/afk.ts'
import { newId } from '../logic/id.ts'
import { applyPotionSlot, type PotionGroup, type PotionSlot } from '../logic/potions.ts'
import { gainExp } from '../logic/progression.ts'
import {
  MAX_PLAY_GAP,
  applyCombatReport,
  maxKills,
  type CombatReport,
  type CombatResult,
} from '../logic/rewards.ts'
import { applyIdentify, type IdentifyResult, type IdentifyTarget } from '../logic/rare.ts'
import { createRng, type Rng } from '../logic/rng.ts'
import { addToInventory, stowDrops, takeFromInventory, type ItemStack } from '../logic/loot.ts'
import {
  applyBuy,
  applySale,
  applySellPieces,
  type PieceSale,
  type PurchaseResult,
  type SaleResult,
} from '../logic/shop.ts'
import { SP_UNIT, applyAuto, applyBar, applyLearn } from '../logic/skills.ts'
import { isZoneOpen, isSpotOpen, zoneSpots } from '../logic/spots.ts'
import { applyClaimBookReward, type BookClaim } from '../logic/book.ts'
import { applyOpenBoxes } from '../logic/boxes.ts'
import {
  applyLevelTitles,
  applyUseTitleItem,
  applyWearTitle,
  pruneTitles,
  type TitleUse,
} from '../logic/titles.ts'
import type { EquipSlot } from '../data/types.ts'
import {
  applyEquip,
  applyExchange,
  applyUnequip,
  applyUpgrade,
  type GearSource,
  type UpgradeResult,
} from '../logic/equipment.ts'
import {
  createDefaultSave,
  loadSave,
  serializeSave,
  type LoadResult,
  type SaveData,
  type Settings,
} from '../logic/save.ts'
import type {
  BoxOpening,
  CashPurchase,
  DevCommands,
  GameService,
  KeyValueStorage,
} from './GameService.ts'
import { applyCashBuy } from '../logic/cashShop.ts'
import { applyCashTicket, type CashTicketUse } from '../logic/cashTickets.ts'
import { LOGIN_MAX_GAP_MS } from '../data/loginCalendar.ts'
import {
  addCalendarOnline,
  calendarForDay,
  calendarDayStart,
  claimLoginCalendar,
  type LoginCalendarProgress,
  type CalendarClaim,
} from '../logic/loginCalendar.ts'
import {
  beginMoonstonePlay,
  finishMoonstonePlay,
  type MoonstonePlay,
  type MoonstoneStart,
} from '../logic/moonstones.ts'
import {
  chargeWorldBoss,
  endWorldBoss,
  summonWorldBoss as beginWorldBoss,
  worldBossDrops,
  recordWorldBossTime,
  fillWorldBossCharge,
} from '../logic/worldBoss.ts'

export const SAVE_KEY = 'idlelc.save'

const copy = <T>(value: T): T => structuredClone(value)

/**
 * Stage 1 backend: the whole account lives in browser storage. It runs the same checks a
 * server will (character rules, hunting spot, kill rate), so the UI is ready for Supabase.
 */
export class LocalGameService implements GameService {
  private save: SaveData
  private readonly storage: KeyValueStorage
  private persisted: string | null = null
  private readonly now: () => number
  private readonly rng: Rng
  private timeScale = 1
  private readonly dungeonRuns = new Map<string, DungeonRun>()
  private dungeonSavedAt = 0
  private calendarClock: { characterId: string; at: number; visible: boolean } | null = null

  constructor(storage: KeyValueStorage, options: { now?: () => number; rng?: Rng } = {}) {
    this.storage = storage
    this.now = options.now ?? Date.now
    this.rng = options.rng ?? createRng(this.now())
    this.save = createDefaultSave(this.now())
  }

  async load(): Promise<LoadResult> {
    this.calendarClock = null
    this.persisted = this.read()
    const { save, status } = loadSave(this.persisted, this.now())
    this.save = {
      ...save,
      characters: save.characters.map((c) => {
        // Rewards and entries were saved together. Reload cannot replay or refund a run.
        const checkpoint = c.dungeons?.active
        const recovered =
          checkpoint && c.dungeons
            ? {
                ...c,
                lastPlayedAt: this.now(),
                dungeons: recordDungeon(c.dungeons, {
                  ...checkpoint,
                  endedAt: this.now(),
                  outcome: 'interrupted',
                }),
              }
            : c
        // the game was closed on the way between spots: the hero is back where it left from
        const bossRecovered = recovered.worldBoss?.active
          ? { ...endWorldBoss(recovered, 'interrupted', this.now()), lastPlayedAt: this.now() }
          : recovered.worldBoss?.pending
            ? { ...recovered, lastPlayedAt: this.now() }
            : recovered
        const { runFrom, ...still } = bossRecovered
        const placed = runFrom && !still.expedition ? { ...still, location: runFrom } : still
        return applyLevelTitles(
          placed.expedition ? placed : pruneTitles(placed, this.now()),
          this.now(),
        )
      }),
    }
    if (
      status !== 'loaded' ||
      save.characters.some(
        (c) => c.dungeons?.active || c.runFrom || c.worldBoss?.active || c.worldBoss?.pending,
      )
    )
      this.persist()
    return { save: copy(this.save), status }
  }

  async createCharacter(input: NewCharacter): Promise<CharacterData> {
    const error = checkNewCharacter(input, this.save.characters)
    if (error) throw new GameError(error)
    const character = createCharacterData(input, newId(), this.now())
    this.save = { ...this.save, characters: [...this.save.characters, character] }
    this.persist()
    return copy(character)
  }

  async deleteCharacter(characterId: string): Promise<void> {
    this.notOnWorldBoss(characterId)
    if (this.character(characterId).dungeons?.active) throw new GameError('in-dungeon')
    this.save = {
      ...this.save,
      characters: this.save.characters.filter((c) => c.id !== characterId),
      activeCharacterId:
        this.save.activeCharacterId === characterId ? null : this.save.activeCharacterId,
    }
    this.persist()
  }

  async setActiveCharacter(characterId: string | null): Promise<void> {
    const current = this.save.activeCharacterId
    if (current && current !== characterId && this.character(current).dungeons?.active)
      throw new GameError('in-dungeon', 'Leave the dungeon before switching characters.')
    if (current && current !== characterId) this.notOnWorldBoss(current)
    if (characterId !== null) this.character(characterId)
    this.save = {
      ...this.save,
      activeCharacterId: characterId,
      ...(this.calendarClock ? { loginCalendar: this.calendarProgress(this.now()) } : {}),
    }
    this.calendarClock = null
    this.persist()
  }

  async travel(
    characterId: string,
    location: CharacterLocation,
    from?: CharacterLocation,
  ): Promise<CharacterData> {
    this.notOnWorldBoss(characterId)
    this.notOnExpedition(characterId)
    const zone = ZONES[location.zoneId]
    if (!zone) throw new GameError('unknown-zone', `Unknown zone: ${location.zoneId}`)
    if (!zone.monsterIds.includes(location.monsterId)) {
      throw new GameError('wrong-monster', `${location.monsterId} is not in ${location.zoneId}`)
    }
    const character = this.character(characterId)
    if (location.zoneId !== character.location.zoneId && !isZoneOpen(character, location.zoneId))
      throw new GameError('zone-locked', 'Defeat the previous region’s last monster first')
    if (!isSpotOpen(character, location)) {
      throw new GameError('spot-locked', `${location.monsterId} is not open yet`)
    }
    // a run on the same map remembers where it started until the hero arrives
    const runFrom =
      from && from.zoneId === location.zoneId && from.monsterId !== location.monsterId
        ? { ...from }
        : undefined
    return copy(
      this.update(characterId, (c) => {
        const next: CharacterData = { ...c, location: { ...location } }
        if (runFrom) next.runFrom = runFrom
        else delete next.runFrom
        return next
      }),
    )
  }

  async arrive(characterId: string): Promise<CharacterData> {
    const character = this.character(characterId)
    if (!character.runFrom) return copy(character)
    return copy(
      this.update(characterId, (c) => {
        const next: CharacterData = { ...c }
        delete next.runFrom
        return next
      }),
    )
  }

  async reportCombat(characterId: string, report: CombatReport): Promise<CombatResult> {
    const character = this.notOnExpedition(characterId)
    const boss = character.worldBoss?.active
    if (boss) {
      if (report.encounterId !== boss.id || report.monsterId !== boss.monsterId)
        throw new GameError('wrong-world-boss')
      if (
        ![0, 1].includes(report.kills) ||
        ![0, 1].includes(report.deaths) ||
        report.kills + report.deaths > 1
      )
        throw new GameError('invalid-world-boss-result')
    } else if (report.encounterId) throw new GameError('world-boss-expired')
    if (character.worldBoss?.pending) throw new GameError('world-boss-result-pending')
    if (report.monsterId !== (boss?.monsterId ?? character.location.monsterId)) {
      throw new GameError('wrong-monster', `${characterId} is not hunting ${report.monsterId}`)
    }
    const monster = MONSTERS[report.monsterId]!
    const now = this.now()
    const elapsed = Math.max(0, (now - character.lastPlayedAt) / 1000)
    const allowed = maxKills(elapsed, this.timeScale)
    const played = Math.min(elapsed, MAX_PLAY_GAP) * this.timeScale
    const timed = boss
      ? recordWorldBossTime(character, report.worldBossTime, this.timeScale !== 1)
      : character
    const fighter = boss
      ? { ...timed, location: { ...character.location, monsterId: boss.monsterId } }
      : character
    const result = applyCombatReport(
      fighter,
      monster,
      report,
      allowed,
      this.rng,
      played,
      now,
      boss ? worldBossDrops : undefined,
    )
    result.character = { ...result.character, location: character.location }
    result.character = boss
      ? result.kills > 0 || report.deaths > 0
        ? endWorldBoss(result.character, result.kills > 0 ? 'victory' : 'death', now)
        : result.character
      : chargeWorldBoss(result.character, result.kills)
    if (boss && result.kills > 0) {
      result.character.worldBoss = {
        ...result.character.worldBoss!,
        pending: {
          record: result.character.worldBoss!.history!.at(-1)!,
          arenaMonsterId: boss.arenaMonsterId,
          exp: result.exp,
          gold: result.gold,
          sp: result.sp,
          drops: result.drops,
        },
      }
    }
    // active play in real seconds (dev speed-up aside)
    const playSeconds = character.stats.playSeconds + Math.min(elapsed, MAX_PLAY_GAP)
    const updated = this.update(characterId, () => ({
      ...result.character,
      stats: { ...result.character.stats, playSeconds },
      lastPlayedAt: now,
    }))
    return copy({ ...result, character: updated })
  }

  async summonWorldBoss(characterId: string): Promise<CharacterData> {
    const character = this.notOnExpedition(characterId)
    const changed = beginWorldBoss(character, newId(), this.now())
    return copy(this.update(characterId, () => changed))
  }

  async cancelWorldBoss(characterId: string): Promise<CharacterData> {
    const character = this.character(characterId)
    return copy(
      this.update(characterId, () => ({
        ...endWorldBoss(character, 'left', this.now()),
        lastPlayedAt: this.now(),
      })),
    )
  }

  async acknowledgeWorldBossLoot(characterId: string): Promise<CharacterData> {
    const character = this.character(characterId)
    if (!character.worldBoss?.pending) return copy(character)
    const worldBoss = { ...character.worldBoss }
    delete worldBoss.pending
    return copy(
      this.update(characterId, () => ({ ...character, worldBoss, lastPlayedAt: this.now() })),
    )
  }

  async startDungeon(characterId: string, dungeonId: DungeonId): Promise<DungeonUpdate> {
    this.notOnWorldBoss(characterId)
    const character = this.notOnExpedition(characterId)
    const run = createDungeonRun(character, dungeonId, newId(), this.now())
    const p = dailyProgress(character.dungeons, this.now())
    const updated = this.update(characterId, (c) => ({
      ...c,
      lastPlayedAt: this.now(),
      dungeons: {
        ...p,
        entries: { ...p.entries, [dungeonId]: (p.entries[dungeonId] ?? 0) + 1 },
        active: dungeonCheckpoint(run),
      },
    }))
    this.dungeonRuns.set(characterId, run)
    this.dungeonSavedAt = this.now()
    return { character: copy(updated), run: copy(run), events: [] }
  }

  async advanceDungeon(
    characterId: string,
    seconds: number,
    input: DungeonPoint,
  ): Promise<DungeonUpdate> {
    let run = this.liveDungeon(characterId)
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 5 * Math.max(1, this.timeScale))
      throw new GameError('invalid-dungeon-time')
    let character = this.character(characterId)
    run = {
      ...run,
      player: {
        ...run.player,
        potions: potionSupply(character),
        effects: expireDungeonPotions(run.player.effects, character.boosts, this.now()),
      },
    }
    const events: DungeonEvent[] = []
    let remaining = seconds
    let important = seconds === 0
    while (remaining > 1e-8 && !run.ended && !run.choices.length) {
      const step = Math.min(0.05, remaining)
      remaining -= step
      const tick = dungeonStep(run, step, input, this.rng)
      run = tick.run
      events.push(...tick.events)
      const inventory = takeFromInventory(character.inventory, tick.potions).inventory
      character = { ...character, inventory }
      for (const monsterId of tick.kills) {
        const reward = rewardKills(
          character,
          MONSTERS[monsterId]!,
          1,
          this.rng,
          this.now(),
          dungeonRewardMultipliers(run),
        )
        const bag = stowDrops(character, reward.drops, this.rng)
        character = {
          ...character,
          ...bag,
          level: reward.level,
          exp: reward.remainingExp,
          gold: character.gold + reward.gold,
          sp: character.sp + reward.sp,
          stats: {
            ...character.stats,
            kills: character.stats.kills + 1,
            monsterKills: {
              ...character.stats.monsterKills,
              [monsterId]: (character.stats.monsterKills[monsterId] ?? 0) + 1,
            },
          },
        }
        const drops = new Map(run.rewards.drops.map((d) => [d.itemId, d.count]))
        for (const drop of reward.drops)
          drops.set(drop.itemId, (drops.get(drop.itemId) ?? 0) + drop.count)
        run.rewards = {
          ...run.rewards,
          exp: run.rewards.exp + reward.exp,
          gold: run.rewards.gold + reward.gold,
          sp: run.rewards.sp + reward.sp,
          drops: [...drops].map(([itemId, count]) => ({ itemId, count })),
        }
      }
      if (tick.boxes.length) {
        // boxes the hero walked into go to the bag, and into the run's loot list
        const boxes = tick.boxes.map((itemId) => ({ itemId, count: 1 }))
        character = { ...character, ...stowDrops(character, boxes, this.rng) }
        const drops = new Map(run.rewards.drops.map((d) => [d.itemId, d.count]))
        for (const box of boxes) drops.set(box.itemId, (drops.get(box.itemId) ?? 0) + 1)
        run.rewards = {
          ...run.rewards,
          drops: [...drops].map(([itemId, count]) => ({ itemId, count })),
        }
        important = true
      }
      const enemy = run.enemies.find((e) => e.fighter.hp > 0)
      // Keep resources, casts and effects; update real character levels and remaining potion supply.
      if (tick.kills.length || tick.potions.length) {
        const dummy = enemy?.fighter ?? run.player
        run.player = updatePlayer(
          {
            phase: 'fighting',
            phaseTime: 0,
            player: run.player,
            monster: dummy,
            monsterId: enemy?.monsterId ?? '',
            kills: 0,
            deaths: 0,
          },
          playerFighter(character, this.now()),
        ).player
        important = true
      }
      character = {
        ...character,
        stats: {
          ...character.stats,
          playSeconds: character.stats.playSeconds + step / Math.max(1, this.timeScale),
        },
      }
    }
    const boosts = dungeonPotionBoosts(run.player.effects, character.boosts, this.now())
    run.player.effects = run.player.effects.flatMap((effect) => {
      if (effect.dungeon || effect.potion !== 'boost' || effect.itemId === undefined)
        return [effect]
      const own = boosts.find((b) => b.itemId === effect.itemId)
      return own ? [{ ...effect, remaining: Math.min(effect.remaining, own.remaining) }] : []
    })
    this.dungeonRuns.set(characterId, run)
    character = this.update(
      characterId,
      () => ({
        ...character,
        boosts,
        lastPlayedAt: this.now(),
        dungeons: { ...character.dungeons!, active: dungeonCheckpoint(run) },
      }),
      important || !!run.choices.length || this.now() - this.dungeonSavedAt >= 1000,
    )
    if (important || run.choices.length || this.now() - this.dungeonSavedAt >= 1000)
      this.dungeonSavedAt = this.now()
    if (run.ended) return this.closeDungeon(characterId, run.ended, events)
    return { character: copy(character), run: copy(run), events }
  }

  async chooseDungeonBuff(characterId: string, skillId: number): Promise<DungeonUpdate> {
    const run = chooseDungeonBuff(this.liveDungeon(characterId), skillId, this.rng)
    this.dungeonRuns.set(characterId, run)
    const character = this.update(characterId, (c) => ({
      ...c,
      dungeons: { ...c.dungeons!, active: dungeonCheckpoint(run) },
    }))
    return { character: copy(character), run: copy(run), events: [] }
  }

  async upgradeDungeonBuff(characterId: string, skillId: number): Promise<CharacterData> {
    this.notOnExpedition(characterId)
    return copy(this.update(characterId, (c) => upgradeDungeonBuff(c, skillId)))
  }

  async drinkDungeonPotion(characterId: string, itemId: number): Promise<DungeonUpdate> {
    const run = this.liveDungeon(characterId)
    if (run.choices.length) throw new GameError('dungeon-paused', 'Choose a blessing first.')
    const character = this.character(characterId)
    const item = getItem(itemId)
    run.player.effects = expireDungeonPotions(run.player.effects, character.boosts, this.now())
    const count = character.inventory.find((s) => s.itemId === itemId)?.count ?? 0
    if (!item.potion || !count || character.level < item.level)
      throw new GameError('potion-unavailable')
    const result = drinkPotion(
      {
        phase: 'fighting',
        phaseTime: 0,
        player: run.player,
        monster: run.player,
        monsterId: '',
        kills: 0,
        deaths: 0,
      },
      { itemId, name: item.name, count, potion: item.potion },
    )
    if (result.problem) throw new GameError(result.problem)
    run.player = result.state.player
    run.player.potionsUsed = {}
    const updated = this.update(characterId, (c) => ({
      ...c,
      inventory: takeFromInventory(c.inventory, [{ itemId, count: 1 }]).inventory,
      boosts: dungeonPotionBoosts(run.player.effects, c.boosts, this.now(), itemId),
    }))
    const init = playerFighter(updated, this.now())
    run.player.potions = init.potions
    return {
      character: copy(updated),
      run: copy(run),
      events: result.events.map((event) => ({ enemyUid: null, event })),
    }
  }

  async finishDungeon(characterId: string): Promise<DungeonUpdate> {
    this.liveDungeon(characterId)
    return this.closeDungeon(characterId, 'left')
  }

  private liveDungeon(characterId: string): DungeonRun {
    const run = this.dungeonRuns.get(characterId)
    if (!run || !this.character(characterId).dungeons?.active) throw new GameError('no-dungeon')
    return run
  }

  private refreshDungeonPlayer(character: CharacterData): void {
    const run = this.dungeonRuns.get(character.id)
    if (!run) return
    const init = playerFighter(character, this.now())
    run.player = { ...run.player, stats: init.stats, skills: init.skills, potions: init.potions }
  }

  private closeDungeon(
    characterId: string,
    outcome: DungeonEnd,
    events: DungeonEvent[] = [],
  ): DungeonUpdate {
    const run = this.liveDungeon(characterId)
    // Owner's dungeon rule: death ends the entry and keeps all rewards already earned.
    const lost = { exp: 0, sp: 0 }
    const record = { ...dungeonCheckpoint(run), outcome, endedAt: this.now(), lost }
    const character = this.update(characterId, (current) => ({
      ...current,
      boosts: dungeonPotionBoosts(
        run.player.effects.filter((e) => outcome !== 'defeated' || e.keepOnDeath),
        current.boosts,
        this.now(),
      ),
      exp: current.exp - lost.exp,
      sp: current.sp - lost.sp,
      stats: { ...current.stats, deaths: current.stats.deaths + (outcome === 'defeated' ? 1 : 0) },
      lastPlayedAt: this.now(),
      dungeons: recordDungeon(current.dungeons!, record),
    }))
    this.dungeonRuns.delete(characterId)
    return { character: copy(character), run: null, events, result: copy(record) }
  }

  async startAfk(characterId: string): Promise<CharacterData> {
    this.notOnWorldBoss(characterId)
    const character = this.notOnExpedition(characterId)
    const now = this.now()
    return copy(
      this.update(characterId, (c) => ({
        ...c,
        expedition: { ...character.location, startedAt: now },
        lastPlayedAt: now,
      })),
    )
  }

  async claimAfk(characterId: string): Promise<AfkResult> {
    const character = this.character(characterId)
    if (!character.expedition) throw new GameError('no-expedition', `${characterId} is not away`)
    const now = this.now()
    const away = Math.max(0, (now - character.expedition.startedAt) / 1000)
    const counts = away >= AFK_MIN_SECONDS
    const result = simulateAfk(character, counts ? away : 0, this.rng, now)
    const updated = this.update(characterId, () => ({
      ...result.character,
      stats: {
        ...result.character.stats,
        expeditions: result.character.stats.expeditions + (counts ? 1 : 0),
      },
      expedition: null,
      lastPlayedAt: now,
    }))
    return copy({ ...result, awaySeconds: away, character: updated })
  }

  async sellItems(characterId: string, items: ItemStack[]): Promise<SaleResult> {
    const sale = applySale(this.character(characterId), items)
    const updated = this.update(characterId, () => sale.character)
    return copy({ ...sale, character: updated })
  }

  async allocateStatPoint(characterId: string, attribute: AttributeKey): Promise<CharacterData> {
    const character = this.notOnExpedition(characterId, true)
    const updated = this.update(characterId, () => allocateStatPoint(character, attribute))
    this.refreshDungeonPlayer(updated)
    return copy(updated)
  }

  async learnSkill(characterId: string, skillId: number): Promise<CharacterData> {
    const learned = applyLearn(this.notOnExpedition(characterId, true), skillId)
    const character = this.update(characterId, () => learned)
    this.refreshDungeonPlayer(character)
    return copy(character)
  }

  async setSkillAuto(characterId: string, skillId: number, auto: boolean): Promise<CharacterData> {
    const changed = applyAuto(this.notOnExpedition(characterId, true), skillId, auto)
    const character = this.update(characterId, () => changed)
    this.refreshDungeonPlayer(character)
    return copy(character)
  }

  async setSkillBar(characterId: string, skillIds: number[]): Promise<CharacterData> {
    const changed = applyBar(this.notOnExpedition(characterId, true), skillIds)
    const character = this.update(characterId, () => changed)
    this.refreshDungeonPlayer(character)
    return copy(character)
  }

  async equipItem(
    characterId: string,
    source: GearSource,
    slot?: EquipSlot,
  ): Promise<CharacterData> {
    const changed = applyEquip(this.notOnExpedition(characterId), source, newId, slot)
    return copy(this.update(characterId, () => changed))
  }

  async unequipItem(characterId: string, slot: EquipSlot): Promise<CharacterData> {
    const changed = applyUnequip(this.notOnExpedition(characterId), slot)
    return copy(this.update(characterId, () => changed))
  }

  async upgradeItem(characterId: string, slot: EquipSlot): Promise<UpgradeResult> {
    const result = applyUpgrade(this.notOnExpedition(characterId), slot, this.rng)
    const updated = this.update(characterId, () => result.character)
    return copy({ ...result, character: updated })
  }

  async exchangeStones(characterId: string, count: number): Promise<CharacterData> {
    const changed = applyExchange(this.notOnExpedition(characterId), count)
    return copy(this.update(characterId, () => changed))
  }

  async buyItem(characterId: string, itemId: number, count: number): Promise<PurchaseResult> {
    const purchase = applyBuy(this.notOnExpedition(characterId), itemId, count)
    const updated = this.update(characterId, () => purchase.character)
    return copy({ ...purchase, character: updated })
  }

  async buyCashOffer(characterId: string, offerId: string, count: number): Promise<CashPurchase> {
    const purchase = applyCashBuy(this.notOnExpedition(characterId), this.save.cash, offerId, count)
    this.save = { ...this.save, cash: purchase.cash }
    const updated = this.update(characterId, () => purchase.character)
    return copy({ ...purchase, character: updated })
  }

  async redeemCashTicket(characterId: string, itemId: number): Promise<CashTicketUse> {
    const use = applyCashTicket(this.character(characterId), this.save.cash, itemId)
    const before = this.save
    try {
      this.save = { ...this.save, cash: use.cash }
      const updated = this.update(characterId, () => use.character)
      return copy({ ...use, character: updated })
    } catch (error) {
      this.save = before
      throw error
    }
  }

  /** No offline catch-up: the first heartbeat only starts a fresh presence interval. */
  async calendarPresence(characterId: string, visible: boolean): Promise<LoginCalendarProgress> {
    this.character(characterId)
    const now = this.now()
    const before = this.save
    const progress = this.calendarProgress(now)
    try {
      if (JSON.stringify(progress) !== JSON.stringify(this.save.loginCalendar)) {
        this.save = { ...this.save, loginCalendar: progress }
        this.persist()
      }
      this.calendarClock = {
        characterId,
        at: now,
        visible: visible && this.save.activeCharacterId === characterId,
      }
      return copy(progress)
    } catch (error) {
      this.save = before
      throw error
    }
  }

  async claimLoginCalendar(characterId: string): Promise<CalendarClaim> {
    const character = this.character(characterId)
    if (this.save.activeCharacterId !== characterId) throw new GameError('calendar-not-playing')
    const now = this.now()
    const claim = claimLoginCalendar(character, this.calendarProgress(now), now)
    const before = this.save
    try {
      this.save = { ...this.save, loginCalendar: claim.calendar }
      const updated = this.update(characterId, () => claim.character)
      if (this.calendarClock) this.calendarClock = { ...this.calendarClock, at: now }
      return copy({ ...claim, character: updated })
    } catch (error) {
      this.save = before
      throw error
    }
  }

  async beginMoonstonePlay(
    characterId: string,
    stoneId: number,
    automatic = false,
  ): Promise<MoonstoneStart> {
    this.notOnWorldBoss(characterId)
    const started = beginMoonstonePlay(
      this.notOnExpedition(characterId),
      stoneId,
      newId(),
      this.now(),
      this.rng,
      automatic,
    )
    const before = this.save
    try {
      const updated = this.update(characterId, () => started.character)
      return copy({ ...started, character: updated })
    } catch (error) {
      this.save = before
      throw error
    }
  }

  async finishMoonstonePlay(characterId: string, spinId: string): Promise<MoonstonePlay> {
    const played = finishMoonstonePlay(this.character(characterId), spinId, this.now())
    const before = this.save
    try {
      const updated = this.update(characterId, () => played.character)
      return copy({ ...played, character: updated })
    } catch (error) {
      this.save = before
      throw error
    }
  }

  async beginLacaBall(
    characterId: string,
    courseId: number,
    tokenId: number,
  ): Promise<LacaBallStart> {
    this.notOnWorldBoss(characterId)
    const started = beginLacaBall(
      this.notOnExpedition(characterId),
      this.save.lacaBall,
      courseId,
      tokenId,
      newId(),
      this.now(),
      this.rng,
    )
    const before = this.save
    try {
      this.save = { ...this.save, lacaBall: started.progress }
      const character = this.update(characterId, () => started.character)
      return copy({ ...started, character })
    } catch (error) {
      this.save = before
      throw error
    }
  }

  async finishLacaBall(characterId: string, drawId: string): Promise<LacaBallResult> {
    const played = finishLacaBall(
      this.character(characterId),
      this.save.lacaBall,
      drawId,
      this.now(),
    )
    const before = this.save
    try {
      this.save = { ...this.save, lacaBall: played.progress }
      const character = this.update(characterId, () => played.character)
      return copy({ ...played, character })
    } catch (error) {
      this.save = before
      throw error
    }
  }

  async openBoxes(characterId: string, itemId: number, count: number): Promise<BoxOpening> {
    const opening = applyOpenBoxes(this.notOnExpedition(characterId), itemId, count, this.rng)
    const updated = this.update(characterId, () => opening.character)
    return copy({ ...opening, character: updated })
  }

  async redeemTitleItem(characterId: string, itemId: number): Promise<TitleUse> {
    if (this.character(characterId).dungeons?.active)
      throw new GameError('in-dungeon', 'Titles are locked for this run.')
    const use = applyUseTitleItem(this.character(characterId), itemId, this.now())
    const updated = this.update(characterId, () => use.character)
    return copy({ ...use, character: updated })
  }

  async setTitle(characterId: string, titleId: number | null): Promise<CharacterData> {
    const character = this.character(characterId)
    if (character.dungeons?.active)
      throw new GameError('in-dungeon', 'Titles are locked for this run.')
    const changed = applyWearTitle(character, titleId, this.now())
    return copy(this.update(characterId, () => changed))
  }

  async claimBookReward(characterId: string, monsterId: string): Promise<BookClaim> {
    const claim = applyClaimBookReward(this.character(characterId), monsterId)
    const updated = this.update(characterId, () => claim.character)
    return copy({ ...claim, character: updated })
  }

  async setPotionSlot(
    characterId: string,
    group: PotionGroup,
    slot: PotionSlot,
  ): Promise<CharacterData> {
    const changed = applyPotionSlot(this.notOnExpedition(characterId, true), group, slot)
    const character = this.update(characterId, () => changed)
    this.refreshDungeonPlayer(character)
    return copy(character)
  }

  async sellGear(characterId: string, uids: string[]): Promise<PieceSale> {
    const sale = applySellPieces(this.character(characterId), uids)
    const updated = this.update(characterId, () => sale.character)
    return copy({ ...sale, character: updated })
  }

  async identifyItems(
    characterId: string,
    magnifierId: number,
    targets: IdentifyTarget[],
  ): Promise<IdentifyResult> {
    const result = applyIdentify(this.notOnExpedition(characterId), magnifierId, targets, this.rng)
    const updated = this.update(characterId, () => result.character)
    return copy({ ...result, character: updated })
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    this.save = { ...this.save, settings: { ...this.save.settings, ...patch } }
    this.persist()
    return copy(this.save.settings)
  }

  async resetSave(): Promise<SaveData> {
    this.calendarClock = null
    this.save = createDefaultSave(this.now())
    this.dungeonRuns.clear()
    this.persist()
    return copy(this.save)
  }

  readonly dev: DevCommands = {
    setLevel: async (characterId, level) =>
      copy(
        this.update(characterId, (c) => ({
          ...c,
          level: clamp(Math.floor(level), 1, MAX_LEVEL),
          allocatedStats: sanitizeAllocatedStats(
            c.allocatedStats,
            clamp(Math.floor(level), 1, MAX_LEVEL),
          ),
          exp: 0,
        })),
      ),
    addExp: async (characterId, amount) =>
      copy(
        this.update(characterId, (c) => {
          const progress = gainExp(c.level, c.exp, Math.max(0, Math.floor(amount)))
          return { ...c, level: progress.level, exp: progress.exp }
        }),
      ),
    addCash: async (amount) => {
      this.save = { ...this.save, cash: Math.max(0, this.save.cash + Math.floor(amount)) }
      this.persist()
      return this.save.cash
    },
    fillWorldBossCharge: async (characterId) =>
      copy(this.update(characterId, (c) => fillWorldBossCharge(c))),
    addGold: async (characterId, amount) =>
      copy(
        this.update(characterId, (c) => ({
          ...c,
          gold: Math.max(0, c.gold + Math.floor(amount)),
        })),
      ),
    addSp: async (characterId, amount) =>
      copy(
        this.update(characterId, (c) => ({
          ...c,
          sp: Math.max(0, c.sp + Math.floor(amount * SP_UNIT)),
        })),
      ),
    setTimeScale: (scale) => {
      this.timeScale = Math.max(1, scale)
    },
    simulateAfk: async (characterId, seconds) =>
      copy(
        this.update(characterId, (c) => {
          const start = (c.expedition?.startedAt ?? this.now()) - Math.max(0, seconds) * 1000
          return { ...c, expedition: { ...(c.expedition ?? c.location), startedAt: start } }
        }),
      ),
    addTitleItem: async (characterId, titleId) => {
      const title = getTitle(titleId)
      if (!title) throw new GameError('unknown-title', `title ${titleId}`)
      return copy(
        this.update(characterId, (c) => ({
          ...c,
          inventory: addToInventory(c.inventory, [{ itemId: title.item, count: 1 }]),
        })),
      )
    },
    resetDungeonEntries: async (characterId) =>
      copy(
        this.update(characterId, (c) => ({
          ...c,
          dungeons: { ...dailyProgress(c.dungeons, this.now()), entries: {} },
        })),
      ),
    openAllSpots: async (characterId) =>
      copy(
        this.update(characterId, (c) => ({
          ...c,
          reachedSpots: Object.fromEntries(
            Object.keys(ZONES).flatMap((zoneId) => {
              const last = zoneSpots(zoneId).at(-1)
              return last ? [[zoneId, last]] : []
            }),
          ),
        })),
      ),
  }

  private calendarProgress(now: number): LoginCalendarProgress {
    const p = calendarForDay(this.save.loginCalendar, now)
    const clock = this.calendarClock
    if (!clock?.visible || this.save.activeCharacterId !== clock.characterId) return p
    const elapsed = now - clock.at
    if (elapsed < 0 || elapsed > LOGIN_MAX_GAP_MS) return p
    // A heartbeat spanning midnight contributes only the part after today's reset.
    return addCalendarOnline(p, Math.max(0, now - Math.max(clock.at, calendarDayStart(now))), now)
  }

  private character(characterId: string): CharacterData {
    const character = this.save.characters.find((c) => c.id === characterId)
    if (!character) throw new GameError('unknown-character', `No character ${characterId}`)
    // An expedition needs the title history up to its claim, including already expired titles.
    return character.expedition ? character : pruneTitles(character, this.now())
  }

  private notOnWorldBoss(characterId: string): void {
    const progress = this.character(characterId).worldBoss
    if (progress?.pending) throw new GameError('world-boss-result-pending')
    if (progress?.active)
      throw new GameError('world-boss-active', 'Finish or leave the World Boss encounter first.')
  }

  private notOnExpedition(characterId: string, allowDungeon = false): CharacterData {
    const character = this.character(characterId)
    if (character.expedition) throw new GameError('on-expedition', `${characterId} is away`)
    if (character.dungeons?.active && !allowDungeon)
      throw new GameError(
        'in-dungeon',
        'Equipment and field activities are locked until you leave the dungeon.',
      )
    return character
  }

  private update(
    characterId: string,
    change: (character: CharacterData) => CharacterData,
    persist = true,
  ): CharacterData {
    // run-out titles go and level titles come with every change
    const now = this.now()
    const changed = change(this.character(characterId))
    const next = applyLevelTitles(changed.expedition ? changed : pruneTitles(changed, now), now)
    this.save = {
      ...this.save,
      characters: this.save.characters.map((c) => (c.id === characterId ? next : c)),
    }
    if (persist) this.persist()
    return next
  }

  private read(): string | null {
    try {
      return this.storage.getItem(SAVE_KEY)
    } catch {
      return null
    }
  }

  private persist(): void {
    const current = this.read()
    if (current !== this.persisted)
      throw new GameError('save-conflict', 'Reload the latest account before saving')
    const serialized = serializeSave(this.save)
    try {
      this.storage.setItem(SAVE_KEY, serialized)
      this.persisted = serialized
    } catch (error) {
      if (error instanceof GameError) throw error
      // private mode / quota exceeded — the game keeps running without saving
    }
  }
}
