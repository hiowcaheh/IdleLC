import { create } from 'zustand'
import { ZONES } from '../game/data/zones.ts'
import type { AfkResult } from '../game/logic/afk.ts'
import type { CharacterData, NewCharacter } from '../game/logic/character.ts'
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
import { createDefaultSave } from '../game/logic/save.ts'
import { farthestSpot, isSpotOpen } from '../game/logic/spots.ts'
import { gameService } from '../game/service/index.ts'
import { combatSession } from '../game/session/combatSession.ts'
import { combatEvents } from './combatEvents.ts'

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
  /** Learns the next level of a skill (rejects with a GameError). */
  learnSkill(skillId: number): Promise<void>
  setSkillAuto(skillId: number, auto: boolean): Promise<void>
  setSkillBar(skillIds: number[]): Promise<void>
  /** Equipment commands of the played character (reject with a GameError). */
  equipItem(source: GearSource, slot?: EquipSlot): Promise<void>
  unequipItem(slot: EquipSlot): Promise<void>
  upgradeItem(slot: EquipSlot): Promise<UpgradeResult>
  exchangeStones(count: number): Promise<void>
  buyItem(itemId: number, count: number): Promise<PurchaseResult>
  sellGear(uids: string[]): Promise<PieceSale>
  identifyItems(magnifierId: number, targets: IdentifyTarget[]): Promise<IdentifyResult>
  setPotionSlot(group: PotionGroup, slot: PotionSlot): Promise<void>
  /** The hero drinks a potion from the bag now (the bag updates with the next report). */
  drinkPotion(itemId: number): DrinkProblem | 'away' | null
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
  devHeal(): void
  devSimulateAfk(seconds: number): void
  /** Opens every hunting spot, then goes to the one given. */
  devTravel(zoneId: string, monsterId: string): void
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
    if (heroKey(current) !== heroKey(character)) {
      combatSession.setPlayer(character)
      set({ hud: toHud(combatSession.state) })
      if (character.level > current.level) {
        set({ levelUp: { level: character.level, key: Date.now() } })
        combatEvents.emit([{ type: 'levelUp', level: character.level }])
      }
    }
  }

  const applyResult = (result: CombatResult) => {
    applyCharacter(result.character)
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
  const reportCombat = (kills: number, deaths: number) => {
    const character = get().character
    if (!character) return
    const potions = combatSession.takePotionsUsed()
    if (kills === 0 && deaths === 0 && potions.length === 0) return
    const report = { monsterId: combatSession.state.monsterId, kills, deaths, potions }
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
    if (event.type === 'death') {
      reportCombat(event.who === 'monster' ? 1 : 0, event.who === 'player' ? 1 : 0)
    }
  })

  const travel = (zoneId: string, monsterId: string) => {
    const character = get().character
    if (!character || character.expedition) return
    const location = { zoneId, monsterId }
    if (!isSpotOpen(character, location)) return
    combatEvents.emit(combatSession.setMonster(monsterId))
    applyCharacter({ ...character, location })
    set({ hud: toHud(combatSession.state) })
    enqueue(() => gameService.travel(character.id, location))
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

    init() {
      initializing ??= (async () => {
        const { save, status } = await enqueue(() => gameService.load())
        set({ save, loadStatus: status })
        if (save.activeCharacterId) await get().enterGame(save.activeCharacterId)
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
      await enqueue(() => gameService.setActiveCharacter(characterId))
      const save = get().save
      const character = save.characters.find((c) => c.id === characterId)
      if (!character) return
      combatSession.start(character, character.location.monsterId)
      set({
        character,
        afkResult: null,
        save: { ...save, activeCharacterId: characterId },
        hud: toHud(combatSession.state),
      })
    },

    async leaveGame() {
      reportCombat(0, 0)
      set({
        character: null,
        timeScale: 1,
        levelUp: null,
        afkResult: null,
        save: { ...get().save, activeCharacterId: null },
      })
      gameService.dev?.setTimeScale(1)
      await enqueue(() => gameService.setActiveCharacter(null))
    },

    async startExpedition() {
      const character = get().character
      if (!character || character.expedition) return
      reportCombat(0, 0)
      try {
        applyCharacter(await enqueue(() => gameService.startAfk(character.id)))
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

    drinkPotion(itemId) {
      const character = get().character
      if (!character || character.expedition) return 'away'
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
      const target = monsterId ?? (character && farthestSpot(character, zoneId))
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
      gameService.dev?.setTimeScale(1)
      combatEvents.emit([{ type: 'reset' }])
      set({ save, character: null, timeScale: 1, afkResult: null, levelUp: null })
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
