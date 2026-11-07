import { purchaseFeed } from './purchases.ts'
import type { AttributeKey } from '../game/logic/attributes.ts'
import type { DungeonId } from '../game/data/dungeons.ts'
import type {
  DungeonPoint,
  DungeonRecord,
  DungeonRun,
  DungeonUpdate,
} from '../game/logic/dungeons.ts'
import { dungeonSession } from '../game/session/dungeonSession.ts'
import { create } from 'zustand'
import { ZONES } from '../game/data/zones.ts'
import type { AfkResult } from '../game/logic/afk.ts'
import type { CharacterData, CharacterLocation, NewCharacter } from '../game/logic/character.ts'
import type { PotionGroup, PotionSlot } from '../game/logic/potions.ts'
import {
  effectiveStats,
  type CombatPhase,
  type CombatState,
  type DrinkProblem,
} from '../game/logic/combat.ts'
import { heroKey } from '../game/logic/fighters.ts'
import type { EquipSlot } from '../game/data/types.ts'
import type { GearSource, UpgradeResult } from '../game/logic/equipment.ts'
import type { ItemStack } from '../game/logic/loot.ts'
import type { CombatResult } from '../game/logic/rewards.ts'
import type { LoadResult, SaveData, Settings } from '../game/logic/save.ts'
import type { IdentifyResult, IdentifyTarget } from '../game/logic/rare.ts'
import type { PieceSale, PurchaseResult, SaleResult } from '../game/logic/shop.ts'
import type { BookClaim } from '../game/logic/book.ts'
import type { TitleUse } from '../game/logic/titles.ts'
import { createDefaultSave } from '../game/logic/save.ts'
import { isSpotOpen, isZoneOpen, zoneSpots } from '../game/logic/spots.ts'
import { gameService } from '../game/service/index.ts'
import { combatSession } from '../game/session/combatSession.ts'
import { planTravel } from '../scene/travelRoute.ts'
import { combatEvents } from './combatEvents.ts'
import { toast } from './toasts.ts'
import { formatSp } from '../ui/skills/format.ts'

/** Low-frequency combat snapshot for the DOM HUD (the 3D scene reads the session directly). */
export interface CombatHud {
  phase: CombatPhase
  monsterId: string
  playerHp: number
  playerMaxHp: number
  playerMp: number
  playerMaxMp: number
  monsterHp: number
  monsterMaxHp: number
}

interface GameStore {
  /** The save has been loaded. */
  ready: boolean
  loadStatus: LoadResult['status'] | null
  save: SaveData
  /** The character being played; null on the character screens. */
  character: CharacterData | null
  hud: CombatHud
  /** Dev-only simulation speed multiplier. */
  timeScale: number
  /** Latest level up of the played character (`key` changes every time). */
  levelUp: { level: number; key: number } | null
  /** Rewards of the expedition the character just came back from, shown until dismissed. */
  afkResult: AfkResult | null
  dungeon: DungeonRun | null
  dungeonResult: DungeonRecord | null
  dungeonEntering: boolean
  startDungeon(id: DungeonId): Promise<void>
  advanceDungeon(seconds: number, input: DungeonPoint): Promise<void>
  chooseDungeonBuff(id: number): Promise<void>
  upgradeDungeonBuff(id: number): Promise<void>
  finishDungeon(): Promise<void>
  dismissDungeonResult(): void

  init(): Promise<void>
  createCharacter(input: NewCharacter): Promise<CharacterData>
  deleteCharacter(characterId: string): Promise<void>
  enterGame(characterId: string): Promise<void>
  leaveGame(): Promise<void>
  /** Sends the played character on an AFK expedition (the fight on screen stops). */
  startExpedition(): Promise<void>
  /** Brings the character back and pays the expedition. */
  returnFromExpedition(): Promise<void>
  dismissAfk(): void
  /** Sells items of the played character; resolves to the sale (rejects with a GameError). */
  sellItems(items: ItemStack[]): Promise<SaleResult>
  /** Spends one available attribute point (rejects with a GameError). */
  allocateStatPoint(attribute: AttributeKey): Promise<void>
  /** Learns the next level of a skill (rejects with a GameError). */
  learnSkill(skillId: number): Promise<void>
  setSkillAuto(skillId: number, auto: boolean): Promise<void>
  setSkillBar(skillIds: number[]): Promise<void>
  /** Equipment commands of the played character (reject with a GameError). */
  equipItem(source: GearSource, slot?: EquipSlot): Promise<void>
  unequipItem(slot: EquipSlot): Promise<void>
  upgradeItem(slot: EquipSlot): Promise<UpgradeResult>
  exchangeStones(count: number): Promise<void>
  /** Buys from the Cash shop; resolves with what went into the bag. */
  buyCashOffer(offerId: string, count: number): Promise<ItemStack[]>
  devAddCash(amount: number): void
  /** Opens dungeon boxes from the bag; resolves with the prizes. */
  openBoxes(itemId: number, count: number): Promise<ItemStack[]>
  buyItem(itemId: number, count: number): Promise<PurchaseResult>
  sellGear(uids: string[]): Promise<PieceSale>
  identifyItems(magnifierId: number, targets: IdentifyTarget[]): Promise<IdentifyResult>
  setPotionSlot(group: PotionGroup, slot: PotionSlot): Promise<void>
  /** Uses a title item from the bag (its title is added, worn if none is). */
  redeemTitleItem(itemId: number): Promise<TitleUse>
  /** Wears an owned title, or takes the worn one off (null). */
  setTitle(titleId: number | null): Promise<void>
  /** Claims a monster's next monster book reward. */
  claimBookReward(monsterId: string): Promise<BookClaim>
  /** The hero drinks a potion from the bag now (the bag updates with the next report). */
  drinkPotion(itemId: number): Promise<DrinkProblem | 'away' | null>
  selectMonster(monsterId: string): void
  selectZone(zoneId: string, monsterId?: string): void
  syncCombat(combat: CombatState): void
  updateSettings(patch: Partial<Settings>): void
  resetSave(): Promise<void>
  setTimeScale(scale: number): void
  /** Dev tools (no-ops when the service does not offer them). */
  devSetLevel(level: number): void
  devAddExp(amount: number): void
  devAddGold(amount: number): void
  devAddSp(amount: number): void
  devKillTarget(): void
  /** Takes a buff or potion effect off the hero (not curses or stuns); false when it can't. */
  removeEffect(which: { skillId: number; itemId?: number }): boolean
  devHeal(): void
  devSimulateAfk(seconds: number): void
  /** Opens every hunting spot, then goes to the one given. */
  devTravel(zoneId: string, monsterId: string): void
  /** Puts a title's item in the bag. */
  devAddTitleItem(titleId: number): void
  /** Gives back today's dungeon entries. */
  devResetDungeonEntries(): void
}

function toHud(c: CombatState): CombatHud {
  const player = effectiveStats(c.player)
  return {
    phase: c.phase,
    monsterId: c.monsterId,
    playerHp: Math.ceil(c.player.hp),
    playerMaxHp: player.maxHp,
    playerMp: Math.floor(c.player.mp),
    playerMaxMp: player.maxMp ?? 0,
    monsterHp: Math.ceil(c.monster.hp),
    monsterMaxHp: c.monster.stats.maxHp,
  }
}

function sameHud(a: CombatHud, b: CombatHud): boolean {
  return (Object.keys(a) as (keyof CombatHud)[]).every((k) => a[k] === b[k])
}

let initializing: Promise<void> | null = null

/** Service commands run one after another, like requests on one connection. */
let queue: Promise<unknown> = Promise.resolve()
function enqueue<T>(command: () => Promise<T>): Promise<T> {
  const run = queue.then(command)
  queue = run.catch(() => undefined)
  return run
}

function logError(error: unknown): void {
  console.warn('[game]', error instanceof Error ? error.message : error)
}

export const useGameStore = create<GameStore>((set, get) => {
  /** Puts an updated character into the store (and the fight, when its level or skills changed). */
  const applyCharacter = (character: CharacterData) => {
    const { save, character: current } = get()
    set({
      save: {
        ...save,
        characters: save.characters.map((c) => (c.id === character.id ? character : c)),
      },
      character: current?.id === character.id ? character : current,
    })
    if (current?.id !== character.id) return
    if (heroKey(current) !== heroKey(character) && !character.dungeons?.active) {
      combatSession.setPlayer(character)
      set({ hud: toHud(combatSession.state) })
      if (character.level > current.level) {
        set({ levelUp: { level: character.level, key: Date.now() } })
        combatEvents.emit([{ type: 'levelUp', level: character.level }])
      }
    }
  }

  const applyDungeon = (update: DungeonUpdate) => {
    const before = get().character
    // Equipment cannot change in a run. Keep stable identities for skinned gear and its materials.
    if (before && JSON.stringify(before.equipment) === JSON.stringify(update.character.equipment))
      update.character.equipment = before.equipment
    const previous = dungeonSession.state
    dungeonSession.set(update.run, update.events)
    applyCharacter(update.character)
    set({ dungeon: update.run, dungeonResult: update.result ?? get().dungeonResult })
    if (update.run) {
      const combat = dungeonSession.combat()!
      set({ hud: toHud(combat) })
      if (before && update.character.level > before.level)
        set({ levelUp: { level: update.character.level, key: Date.now() } })
      const old = previous?.rewards
      const reward = update.run.rewards
      const drops = reward.drops.flatMap((drop) => {
        const count = drop.count - (old?.drops.find((d) => d.itemId === drop.itemId)?.count ?? 0)
        return count > 0 ? [{ itemId: drop.itemId, count }] : []
      })
      if (
        old &&
        (reward.exp !== old.exp || reward.gold !== old.gold || reward.sp !== old.sp || drops.length)
      )
        combatEvents.emit([
          {
            type: 'reward',
            exp: reward.exp - old.exp,
            gold: reward.gold - old.gold,
            sp: reward.sp - old.sp,
            levelsGained: update.character.level - (before?.level ?? update.character.level),
            drops,
          },
        ])
    } else {
      dungeonSession.reset()
      combatSession.start(update.character, update.character.location.monsterId)
      combatEvents.emit([{ type: 'reset' }])
      set({ hud: toHud(combatSession.state) })
    }
  }

  const applyResult = (result: CombatResult) => {
    applyCharacter(result.character)
    // the server's death penalty (death.ts)
    if (result.lost.exp > 0 || result.lost.sp > 0)
      toast(
        `You died and lost ${result.lost.exp.toLocaleString('en-US')} EXP` +
          (result.lost.sp > 0 ? ` and ${formatSp(result.lost.sp)} SP.` : '.'),
        'error',
      )
    combatEvents.emit(
      result.optionsGained.map(({ itemId, option }) => ({
        type: 'optionGained' as const,
        itemId,
        option,
      })),
    )
    if (result.exp || result.gold || result.sp || result.levelsGained || result.drops.length) {
      combatEvents.emit([
        {
          type: 'reward',
          exp: result.exp,
          gold: result.gold,
          sp: result.sp,
          levelsGained: result.levelsGained,
          drops: result.drops,
        },
      ])
    }
  }

  /**
   * Fight outcomes and the potions drunk go to the service, which decides the rewards and takes the
   * potions from the bag.
   */
  /** Reports the fight; `always` also when nothing was killed or drunk (the boosts changed). */
  const reportCombat = (kills: number, deaths: number, always = false) => {
    const character = get().character
    if (!character || character.dungeons?.active) return
    const potions = combatSession.takePotionsUsed()
    if (!always && kills === 0 && deaths === 0 && potions.length === 0) return
    const report = {
      monsterId: combatSession.state.monsterId,
      kills,
      deaths,
      potions,
      // what is left of the boost potions, kept in the save
      boosts: combatSession.boosts(),
    }
    enqueue(() => gameService.reportCombat(character.id, report))
      .then(applyResult)
      .catch(logError)
      .finally(() => {
        if (potions.length === 0) return
        combatSession.settlePotions(potions)
        const played = get().character
        if (played?.id === character.id) combatSession.setPlayer(played)
      })
  }

  combatEvents.subscribe((event) => {
    // arrived: the save no longer needs the spot the run started from
    if (event.type === 'arrive') {
      runFrom = null
      const id = get().character?.id
      if (id) enqueue(() => gameService.arrive(id)).catch(logError)
    }
    if (event.type === 'death') {
      reportCombat(event.who === 'monster' ? 1 : 0, event.who === 'player' ? 1 : 0)
    }
  })

  /**
   * The spot the hero last stood at while it runs to another one: an expedition started on the way
   * begins there, so leaving at once can't skip the run (owner's report 2026-11-05).
   */
  let runFrom: CharacterLocation | null = null
  const running = () => combatSession.state.phase === 'traveling'

  const travel = (zoneId: string, monsterId: string) => {
    const character = get().character
    if (!character || character.expedition || character.dungeons?.active || get().dungeonEntering)
      return
    const location = { zoneId, monsterId }
    const newZone = zoneId !== character.location.zoneId
    if (newZone && !isZoneOpen(character, zoneId)) return
    if (!isSpotOpen(character, location)) return
    // on the zone's map the hero runs the route there, around what can't be crossed; another map
    // is a jump behind its loading screen
    const distance = newZone
      ? 0
      : monsterId === combatSession.state.monsterId
        ? undefined
        : planTravel(zoneId, monsterId)
    runFrom = newZone ? null : running() && runFrom ? runFrom : character.location
    const from = runFrom ?? undefined
    combatEvents.emit(combatSession.setMonster(monsterId, distance))
    applyCharacter({ ...character, location })
    set({ hud: toHud(combatSession.state) })
    enqueue(() => gameService.travel(character.id, location, from))
      .then(applyCharacter)
      .catch(logError)
  }

  /** Ends the expedition of the played character, shows the rewards and restarts the fight. */
  const claimAfk = async () => {
    const character = get().character
    if (!character?.expedition) return
    try {
      const result = await enqueue(() => gameService.claimAfk(character.id))
      applyCharacter(result.character)
      combatSession.resume(
        result.character,
        result.character.location.monsterId,
        result.awaySeconds,
      )
      combatEvents.emit([{ type: 'reset' }])
      set({ hud: toHud(combatSession.state), afkResult: result.seconds > 0 ? result : null })
    } catch (error) {
      logError(error)
    }
  }

  const playedId = () => {
    const character = get().character
    if (!character) throw new Error('No character is being played')
    return character.id
  }

  const dev = (command: (characterId: string) => Promise<CharacterData> | undefined) => {
    const character = get().character
    if (!character) return
    enqueue(async () => command(character.id))
      .then((c) => c && applyCharacter(c))
      .catch(logError)
  }

  return {
    ready: false,
    loadStatus: null,
    save: createDefaultSave(),
    character: null,
    hud: toHud(combatSession.state),
    timeScale: 1,
    levelUp: null,
    afkResult: null,
    dungeon: null,
    dungeonResult: null,
    dungeonEntering: false,

    async startDungeon(id) {
      if (get().dungeonEntering || get().dungeon) return
      const character = get().character
      if (!character || character.expedition) return
      if (running()) throw new Error('Finish travelling before entering a dungeon.')
      reportCombat(0, 0, true)
      set({ dungeonEntering: true, dungeonResult: null })
      try {
        applyDungeon(await enqueue(() => gameService.startDungeon(character.id, id)))
      } finally {
        set({ dungeonEntering: false })
      }
    },

    async advanceDungeon(seconds, input) {
      const character = get().character
      if (!character || !get().dungeon) return
      applyDungeon(await enqueue(() => gameService.advanceDungeon(character.id, seconds, input)))
    },

    async chooseDungeonBuff(id) {
      applyDungeon(await enqueue(() => gameService.chooseDungeonBuff(playedId(), id)))
    },

    async upgradeDungeonBuff(id) {
      applyCharacter(await enqueue(() => gameService.upgradeDungeonBuff(playedId(), id)))
    },

    async finishDungeon() {
      applyDungeon(await enqueue(() => gameService.finishDungeon(playedId())))
    },

    dismissDungeonResult() {
      set({ dungeonResult: null })
    },

    init() {
      initializing ??= (async () => {
        const { save, status } = await enqueue(() => gameService.load())
        set({ save, loadStatus: status })
        if (save.activeCharacterId) await get().enterGame(save.activeCharacterId)
        const recovered = get().character?.dungeons?.history[0]
        if (recovered?.outcome === 'interrupted' && recovered.endedAt >= Date.now() - 10000)
          set({ dungeonResult: recovered })
        set({ ready: true })
      })()
      return initializing
    },

    async createCharacter(input) {
      const character = await enqueue(() => gameService.createCharacter(input))
      const save = get().save
      set({ save: { ...save, characters: [...save.characters, character] } })
      return character
    },

    async deleteCharacter(characterId) {
      await enqueue(() => gameService.deleteCharacter(characterId))
      const save = get().save
      set({
        save: {
          ...save,
          characters: save.characters.filter((c) => c.id !== characterId),
          activeCharacterId: save.activeCharacterId === characterId ? null : save.activeCharacterId,
        },
      })
    },

    async enterGame(characterId) {
      if (get().character?.id === characterId && get().dungeon) return
      await enqueue(() => gameService.setActiveCharacter(characterId))
      const save = get().save
      const character = save.characters.find((c) => c.id === characterId)
      if (!character) return
      dungeonSession.reset()
      combatSession.start(character, character.location.monsterId)
      set({
        character,
        dungeon: null,
        dungeonResult: null,
        dungeonEntering: false,
        afkResult: null,
        save: { ...save, activeCharacterId: characterId },
        hud: toHud(combatSession.state),
      })
    },

    async leaveGame() {
      if (get().dungeon) await get().finishDungeon()
      dungeonSession.reset()
      reportCombat(0, 0)
      set({
        character: null,
        dungeon: null,
        dungeonResult: null,
        dungeonEntering: false,
        timeScale: 1,
        levelUp: null,
        afkResult: null,
        save: { ...get().save, activeCharacterId: null },
      })
      gameService.dev?.setTimeScale(1)
      await enqueue(() => gameService.setActiveCharacter(null))
    },

    async startExpedition() {
      let character = get().character
      if (!character || character.expedition || character.dungeons?.active) return
      reportCombat(0, 0)
      try {
        // started on the way to another spot: the hero goes from the spot it left
        if (running() && runFrom) {
          const from = runFrom
          runFrom = null
          character = await enqueue(() => gameService.travel(character!.id, from))
          applyCharacter(character)
        }
        const id = character.id
        applyCharacter(await enqueue(() => gameService.startAfk(id)))
        combatEvents.emit([{ type: 'reset' }])
      } catch (error) {
        logError(error)
      }
    },

    returnFromExpedition() {
      return claimAfk()
    },

    dismissAfk() {
      set({ afkResult: null })
    },

    async sellItems(items) {
      const character = get().character
      if (!character) throw new Error('No character is being played')
      const sale = await enqueue(() => gameService.sellItems(character.id, items))
      applyCharacter(sale.character)
      return sale
    },

    async allocateStatPoint(attribute) {
      const id = playedId()
      applyCharacter(await enqueue(() => gameService.allocateStatPoint(id, attribute)))
    },

    async learnSkill(skillId) {
      const character = get().character
      if (!character) throw new Error('No character is being played')
      applyCharacter(await enqueue(() => gameService.learnSkill(character.id, skillId)))
    },

    async setSkillAuto(skillId, auto) {
      const character = get().character
      if (!character) throw new Error('No character is being played')
      applyCharacter(await enqueue(() => gameService.setSkillAuto(character.id, skillId, auto)))
    },

    async setSkillBar(skillIds) {
      const id = playedId()
      applyCharacter(await enqueue(() => gameService.setSkillBar(id, skillIds)))
    },

    async equipItem(source, slot) {
      const id = playedId()
      applyCharacter(await enqueue(() => gameService.equipItem(id, source, slot)))
    },

    async unequipItem(slot) {
      const id = playedId()
      applyCharacter(await enqueue(() => gameService.unequipItem(id, slot)))
    },

    async upgradeItem(slot) {
      const id = playedId()
      const result = await enqueue(() => gameService.upgradeItem(id, slot))
      applyCharacter(result.character)
      return result
    },

    async exchangeStones(count) {
      const id = playedId()
      applyCharacter(await enqueue(() => gameService.exchangeStones(id, count)))
    },

    async buyCashOffer(offerId, count) {
      const id = playedId()
      const purchase = await enqueue(() => gameService.buyCashOffer(id, offerId, count))
      applyCharacter(purchase.character)
      set({ save: { ...get().save, cash: purchase.cash } })
      purchaseFeed.emit(purchase.items)
      return purchase.items
    },

    devAddCash(amount) {
      enqueue(async () => (await gameService.dev?.addCash(amount)) ?? get().save.cash)
        .then((cash) => set({ save: { ...get().save, cash } }))
        .catch(logError)
    },

    async openBoxes(itemId, count) {
      const id = playedId()
      const opening = await enqueue(() => gameService.openBoxes(id, itemId, count))
      applyCharacter(opening.character)
      return opening.prizes
    },

    async buyItem(itemId, count) {
      const id = playedId()
      const purchase = await enqueue(() => gameService.buyItem(id, itemId, count))
      applyCharacter(purchase.character)
      return purchase
    },

    async setPotionSlot(group, slot) {
      const id = playedId()
      applyCharacter(await enqueue(() => gameService.setPotionSlot(id, group, slot)))
    },

    async drinkPotion(itemId) {
      const character = get().character
      if (!character || character.expedition) return 'away'
      if (character.dungeons?.active) {
        if (get().dungeon?.choices.length) return 'cooldown'
        applyDungeon(await enqueue(() => gameService.drinkDungeonPotion(character.id, itemId)))
        return null
      }
      const { events, problem } = combatSession.drink(character, itemId)
      if (problem) return problem
      combatEvents.emit(events)
      set({ hud: toHud(combatSession.state) })
      // the service takes it from the bag right away, so the bag shows one less
      reportCombat(0, 0)
      return null
    },

    async sellGear(uids) {
      const id = playedId()
      const sale = await enqueue(() => gameService.sellGear(id, uids))
      applyCharacter(sale.character)
      return sale
    },

    async redeemTitleItem(itemId) {
      const id = playedId()
      const use = await enqueue(() => gameService.redeemTitleItem(id, itemId))
      applyCharacter(use.character)
      return use
    },

    async claimBookReward(monsterId) {
      const id = playedId()
      const claim = await enqueue(() => gameService.claimBookReward(id, monsterId))
      applyCharacter(claim.character)
      return claim
    },

    async setTitle(titleId) {
      const id = playedId()
      applyCharacter(await enqueue(() => gameService.setTitle(id, titleId)))
    },

    async identifyItems(magnifierId, targets) {
      const id = playedId()
      const result = await enqueue(() => gameService.identifyItems(id, magnifierId, targets))
      applyCharacter(result.character)
      return result
    },

    selectMonster(monsterId) {
      const character = get().character
      if (character) travel(character.location.zoneId, monsterId)
    },

    selectZone(zoneId, monsterId) {
      const character = get().character
      // a new map always starts at its first spot (owner's rule 2026-11-05)
      const target = monsterId ?? (character && zoneSpots(zoneId)[0])
      if (ZONES[zoneId] && target) travel(zoneId, target)
    },

    syncCombat(combat) {
      const next = toHud(combat)
      if (!sameHud(get().hud, next)) set({ hud: next })
    },

    updateSettings(patch) {
      const save = get().save
      set({ save: { ...save, settings: { ...save.settings, ...patch } } })
      enqueue(() => gameService.updateSettings(patch))
        .then((settings) => set({ save: { ...get().save, settings } }))
        .catch(logError)
    },

    async resetSave() {
      const save = await enqueue(() => gameService.resetSave())
      dungeonSession.reset()
      gameService.dev?.setTimeScale(1)
      combatEvents.emit([{ type: 'reset' }])
      set({
        save,
        character: null,
        dungeon: null,
        dungeonResult: null,
        dungeonEntering: false,
        timeScale: 1,
        afkResult: null,
        levelUp: null,
      })
    },

    setTimeScale(scale) {
      gameService.dev?.setTimeScale(scale)
      set({ timeScale: scale })
    },

    devSetLevel(level) {
      dev((id) => gameService.dev?.setLevel(id, level))
    },

    devAddExp(amount) {
      dev((id) => gameService.dev?.addExp(id, amount))
    },

    devAddGold(amount) {
      dev((id) => gameService.dev?.addGold(id, amount))
    },

    devAddSp(amount) {
      dev((id) => gameService.dev?.addSp(id, amount))
    },

    devKillTarget() {
      if (get().character?.expedition) return
      combatEvents.emit(combatSession.killTarget())
      set({ hud: toHud(combatSession.state) })
    },

    removeEffect(which) {
      if (get().dungeon) return false
      if (get().character?.expedition || !combatSession.removeEffect(which)) return false
      set({ hud: toHud(combatSession.state) })
      // a boost potion taken off leaves the save too
      if (which.itemId !== undefined) reportCombat(0, 0, true)
      return true
    },

    devHeal() {
      combatSession.heal()
      set({ hud: toHud(combatSession.state) })
    },

    devTravel(zoneId, monsterId) {
      const character = get().character
      if (!character || !gameService.dev) return
      const dev = gameService.dev
      enqueue(() => dev.openAllSpots(character.id))
        .then((c) => {
          applyCharacter(c)
          travel(zoneId, monsterId)
        })
        .catch(logError)
    },

    devAddTitleItem(titleId) {
      dev((id) => gameService.dev?.addTitleItem(id, titleId))
    },

    devResetDungeonEntries() {
      dev((id) => gameService.dev?.resetDungeonEntries(id))
    },

    devSimulateAfk(seconds) {
      const character = get().character
      if (!character || !gameService.dev) return
      const dev = gameService.dev
      enqueue(() => dev.simulateAfk(character.id, seconds))
        .then((c) => {
          applyCharacter(c)
          return claimAfk()
        })
        .catch(logError)
    },
  }
})
