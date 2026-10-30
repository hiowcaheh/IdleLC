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
import { addToInventory, type ItemStack } from '../logic/loot.ts'
import {
  applyBuy,
  applySale,
  applySellPieces,
  type PieceSale,
  type PurchaseResult,
  type SaleResult,
} from '../logic/shop.ts'
import { SP_UNIT, applyAuto, applyBar, applyLearn } from '../logic/skills.ts'
import { isSpotOpen, zoneSpots } from '../logic/spots.ts'
import { applyClaimBookReward, type BookClaim } from '../logic/book.ts'
import { applyUseTitleItem, applyWearTitle, pruneTitles, type TitleUse } from '../logic/titles.ts'
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
import type { DevCommands, GameService, KeyValueStorage } from './GameService.ts'

export const SAVE_KEY = 'idlelc.save'

const copy = <T>(value: T): T => structuredClone(value)

/**
 * Stage 1 backend: the whole account lives in browser storage. It runs the same checks a
 * server will (character rules, hunting spot, kill rate), so the UI is ready for Supabase.
 */
export class LocalGameService implements GameService {
  private save: SaveData
  private readonly storage: KeyValueStorage
  private readonly now: () => number
  private readonly rng: Rng
  private timeScale = 1

  constructor(storage: KeyValueStorage, options: { now?: () => number; rng?: Rng } = {}) {
    this.storage = storage
    this.now = options.now ?? Date.now
    this.rng = options.rng ?? createRng(this.now())
    this.save = createDefaultSave(this.now())
  }

  async load(): Promise<LoadResult> {
    const { save, status } = loadSave(this.read(), this.now())
    this.save = {
      ...save,
      characters: save.characters.map((c) => pruneTitles(c, this.now())),
    }
    if (status !== 'loaded') this.persist()
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
    this.character(characterId)
    this.save = {
      ...this.save,
      characters: this.save.characters.filter((c) => c.id !== characterId),
      activeCharacterId:
        this.save.activeCharacterId === characterId ? null : this.save.activeCharacterId,
    }
    this.persist()
  }

  async setActiveCharacter(characterId: string | null): Promise<void> {
    if (characterId !== null) this.character(characterId)
    this.save = { ...this.save, activeCharacterId: characterId }
    this.persist()
  }

  async travel(characterId: string, location: CharacterLocation): Promise<CharacterData> {
    this.notOnExpedition(characterId)
    const zone = ZONES[location.zoneId]
    if (!zone) throw new GameError('unknown-zone', `Unknown zone: ${location.zoneId}`)
    if (!zone.monsterIds.includes(location.monsterId)) {
      throw new GameError('wrong-monster', `${location.monsterId} is not in ${location.zoneId}`)
    }
    if (!isSpotOpen(this.character(characterId), location)) {
      throw new GameError('spot-locked', `${location.monsterId} is not open yet`)
    }
    return copy(this.update(characterId, (c) => ({ ...c, location: { ...location } })))
  }

  async reportCombat(characterId: string, report: CombatReport): Promise<CombatResult> {
    const character = this.notOnExpedition(characterId)
    if (report.monsterId !== character.location.monsterId) {
      throw new GameError('wrong-monster', `${characterId} is not hunting ${report.monsterId}`)
    }
    const monster = MONSTERS[report.monsterId]!
    const now = this.now()
    const elapsed = Math.max(0, (now - character.lastPlayedAt) / 1000)
    const allowed = maxKills(elapsed, this.timeScale)
    const played = Math.min(elapsed, MAX_PLAY_GAP) * this.timeScale
    const result = applyCombatReport(character, monster, report, allowed, this.rng, played)
    // active play in real seconds (dev speed-up aside)
    const playSeconds = character.stats.playSeconds + Math.min(elapsed, MAX_PLAY_GAP)
    const updated = this.update(characterId, () => ({
      ...result.character,
      stats: { ...result.character.stats, playSeconds },
      lastPlayedAt: now,
    }))
    return copy({ ...result, character: updated })
  }

  async startAfk(characterId: string): Promise<CharacterData> {
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
    const result = simulateAfk(character, counts ? away : 0, this.rng)
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

  async learnSkill(characterId: string, skillId: number): Promise<CharacterData> {
    const learned = applyLearn(this.notOnExpedition(characterId), skillId)
    return copy(this.update(characterId, () => learned))
  }

  async setSkillAuto(characterId: string, skillId: number, auto: boolean): Promise<CharacterData> {
    const changed = applyAuto(this.notOnExpedition(characterId), skillId, auto)
    return copy(this.update(characterId, () => changed))
  }

  async setSkillBar(characterId: string, skillIds: number[]): Promise<CharacterData> {
    const changed = applyBar(this.notOnExpedition(characterId), skillIds)
    return copy(this.update(characterId, () => changed))
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

  async redeemTitleItem(characterId: string, itemId: number): Promise<TitleUse> {
    const use = applyUseTitleItem(this.character(characterId), itemId, this.now())
    const updated = this.update(characterId, () => use.character)
    return copy({ ...use, character: updated })
  }

  async setTitle(characterId: string, titleId: number | null): Promise<CharacterData> {
    const changed = applyWearTitle(this.character(characterId), titleId, this.now())
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
    const changed = applyPotionSlot(this.notOnExpedition(characterId), group, slot)
    return copy(this.update(characterId, () => changed))
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
    try {
      this.storage.removeItem(SAVE_KEY)
    } catch {
      // storage unavailable — nothing to remove
    }
    this.save = createDefaultSave(this.now())
    this.persist()
    return copy(this.save)
  }

  readonly dev: DevCommands = {
    setLevel: async (characterId, level) =>
      copy(
        this.update(characterId, (c) => ({
          ...c,
          level: clamp(Math.floor(level), 1, MAX_LEVEL),
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

  private character(characterId: string): CharacterData {
    const character = this.save.characters.find((c) => c.id === characterId)
    if (!character) throw new GameError('unknown-character', `No character ${characterId}`)
    return character
  }

  private notOnExpedition(characterId: string): CharacterData {
    const character = this.character(characterId)
    if (character.expedition) throw new GameError('on-expedition', `${characterId} is away`)
    return character
  }

  private update(
    characterId: string,
    change: (character: CharacterData) => CharacterData,
  ): CharacterData {
    // run-out titles go with every change
    const next = pruneTitles(change(this.character(characterId)), this.now())
    this.save = {
      ...this.save,
      characters: this.save.characters.map((c) => (c.id === characterId ? next : c)),
    }
    this.persist()
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
    try {
      this.storage.setItem(SAVE_KEY, serializeSave(this.save))
    } catch {
      // private mode / quota exceeded — the game keeps running without saving
    }
  }
}
