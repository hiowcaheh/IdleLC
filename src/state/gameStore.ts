import { create } from 'zustand'
import type { CombatPhase, CombatState } from '../game/logic/combat.ts'
import type { LoadResult, SaveData, Settings } from '../game/logic/save.ts'
import { gameService } from '../game/service/index.ts'
import { combatEvents } from './combatEvents.ts'

/** Low-frequency combat snapshot for the DOM HUD (the 3D scene reads the service directly). */
export interface CombatHud {
  phase: CombatPhase
  monsterId: string
  playerHp: number
  playerMaxHp: number
  playerLevel: number
  monsterHp: number
  monsterMaxHp: number
  kills: number
}

interface GameStore {
  save: SaveData
  hud: CombatHud
  loadStatus: LoadResult['status']
  /** Dev-only simulation speed multiplier. */
  timeScale: number
  syncCombat(combat: CombatState): void
  selectMonster(monsterId: string): void
  selectZone(zoneId: string, monsterId?: string): void
  /** Dev tools (no-ops when the service does not offer them). */
  devSetLevel(level: number): void
  devKillTarget(): void
  devHeal(): void
  updateSettings(patch: Partial<Settings>): void
  resetSave(): void
  setTimeScale(scale: number): void
}

function toHud(c: CombatState): CombatHud {
  return {
    phase: c.phase,
    monsterId: c.monsterId,
    playerHp: Math.ceil(c.player.hp),
    playerMaxHp: c.player.stats.maxHp,
    playerLevel: c.player.level,
    monsterHp: Math.ceil(c.monster.hp),
    monsterMaxHp: c.monster.stats.maxHp,
    kills: c.kills,
  }
}

function sameHud(a: CombatHud, b: CombatHud): boolean {
  return (Object.keys(a) as (keyof CombatHud)[]).every((k) => a[k] === b[k])
}

const loadStatus = gameService.load()

export const useGameStore = create<GameStore>((set, get) => ({
  save: gameService.getSave(),
  hud: toHud(gameService.getCombat()),
  loadStatus,
  timeScale: 1,

  syncCombat(combat) {
    const next = toHud(combat)
    if (!sameHud(get().hud, next)) set({ hud: next })
  },

  selectMonster(monsterId) {
    combatEvents.emit(gameService.selectMonster(monsterId))
    set({ save: gameService.getSave(), hud: toHud(gameService.getCombat()) })
  },

  selectZone(zoneId, monsterId) {
    combatEvents.emit(gameService.selectZone(zoneId, monsterId))
    set({ save: gameService.getSave(), hud: toHud(gameService.getCombat()) })
  },

  devSetLevel(level) {
    gameService.dev?.setLevel(level)
    set({ hud: toHud(gameService.getCombat()) })
  },

  devKillTarget() {
    combatEvents.emit(gameService.dev?.killTarget() ?? [])
    set({ save: gameService.getSave(), hud: toHud(gameService.getCombat()) })
  },

  devHeal() {
    gameService.dev?.heal()
    set({ hud: toHud(gameService.getCombat()) })
  },

  updateSettings(patch) {
    set({ save: gameService.updateSettings(patch) })
  },

  resetSave() {
    const save = gameService.resetSave()
    combatEvents.emit([{ type: 'reset' }])
    set({ save, hud: toHud(gameService.getCombat()), timeScale: 1 })
  },

  setTimeScale(scale) {
    set({ timeScale: scale })
  },
}))
