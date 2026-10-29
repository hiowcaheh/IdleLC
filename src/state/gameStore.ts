import { create } from 'zustand'
import { ZONES } from '../game/data/zones.ts'
import type { AfkResult } from '../game/logic/afk.ts'
import type { CharacterData, NewCharacter } from '../game/logic/character.ts'
import type { CombatPhase, CombatState } from '../game/logic/combat.ts'
import type { ItemStack } from '../game/logic/loot.ts'
import type { CombatResult } from '../game/logic/rewards.ts'
import type { LoadResult, SaveData, Settings } from '../game/logic/save.ts'
import type { SaleResult } from '../game/logic/shop.ts'
import { createDefaultSave } from '../game/logic/save.ts'
import { gameService } from '../game/service/index.ts'
import { combatSession } from '../game/session/combatSession.ts'
import { combatEvents } from './combatEvents.ts'

/** Low-frequency combat snapshot for the DOM HUD (the 3D scene reads the session directly). */
export interface CombatHud {
  phase: CombatPhase
  monsterId: string
  playerHp: number
  playerMaxHp: number
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
  devKillTarget(): void
  devHeal(): void
  devSimulateAfk(seconds: number): void
}

function toHud(c: CombatState): CombatHud {
  return {
    phase: c.phase,
    monsterId: c.monsterId,
    playerHp: Math.ceil(c.player.hp),
    playerMaxHp: c.player.stats.maxHp,
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
  /** Puts an updated character into the store (and the fight, when its level changed). */
  const applyCharacter = (character: CharacterData) => {
    const { save, character: current } = get()
    set({
      save: {
        ...save,
        characters: save.characters.map((c) => (c.id === character.id ? character : c)),
      },
      character: current?.id === character.id ? character : current,
    })
    if (current?.id === character.id && current.level !== character.level) {
      combatSession.setPlayer(character.classId, character.level)
      set({ hud: toHud(combatSession.state) })
      if (character.level > current.level) {
        set({ levelUp: { level: character.level, key: Date.now() } })
        combatEvents.emit([{ type: 'levelUp', level: character.level }])
      }
    }
  }

  const applyResult = (result: CombatResult) => {
    applyCharacter(result.character)
    if (result.exp || result.gold || result.levelsGained || result.drops.length) {
      combatEvents.emit([
        {
          type: 'reward',
          exp: result.exp,
          gold: result.gold,
          levelsGained: result.levelsGained,
          drops: result.drops,
        },
      ])
    }
  }

  /** Fight outcomes go to the service, which decides the rewards. */
  combatEvents.subscribe((event) => {
    if (event.type !== 'death') return
    const character = get().character
    if (!character) return
    const report = {
      monsterId: combatSession.state.monsterId,
      kills: event.who === 'monster' ? 1 : 0,
      deaths: event.who === 'player' ? 1 : 0,
    }
    enqueue(() => gameService.reportCombat(character.id, report))
      .then(applyResult)
      .catch(logError)
  })

  const travel = (zoneId: string, monsterId: string) => {
    const character = get().character
    if (!character || character.expedition) return
    combatEvents.emit(combatSession.setMonster(monsterId))
    const location = { zoneId, monsterId }
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
      combatSession.start(
        result.character.classId,
        result.character.level,
        result.character.location.monsterId,
      )
      combatEvents.emit([{ type: 'reset' }])
      set({ hud: toHud(combatSession.state), afkResult: result.seconds > 0 ? result : null })
    } catch (error) {
      logError(error)
    }
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
      combatSession.start(character.classId, character.level, character.location.monsterId)
      set({
        character,
        afkResult: null,
        save: { ...save, activeCharacterId: characterId },
        hud: toHud(combatSession.state),
      })
    },

    async leaveGame() {
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

    selectMonster(monsterId) {
      const character = get().character
      if (character) travel(character.location.zoneId, monsterId)
    },

    selectZone(zoneId, monsterId) {
      const zone = ZONES[zoneId]
      if (zone) travel(zoneId, monsterId ?? zone.monsterIds[0]!)
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

    devKillTarget() {
      if (get().character?.expedition) return
      combatEvents.emit(combatSession.killTarget())
      set({ hud: toHud(combatSession.state) })
    },

    devHeal() {
      combatSession.heal()
      set({ hud: toHud(combatSession.state) })
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
