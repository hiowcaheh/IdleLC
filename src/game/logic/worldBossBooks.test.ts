import { describe, expect, it, vi } from 'vitest'

vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
}))

import { CASH_OFFERS } from '../data/cashShop.ts'
import { CASH_TICKET_100_ID, cashTicketValue } from '../data/cashTickets.ts'
import { getItem } from '../data/items.ts'
import { WORLD_BOSS_BOOKS } from '../data/worldBossBooks.ts'
import { WORLD_BOSSES, worldBossFor } from '../data/worldBosses.ts'
import { createCharacterData } from './character.ts'
import { applyWorldBossBook, summonWorldBoss, worldBossCharge } from './worldBoss.ts'

const hero = (books: number[]) => ({
  ...createCharacterData({ name: 'Summoner', classId: 'knight' }, 'b', 1_000),
  inventory: books.map((itemId) => ({ itemId, count: 1 })),
})

describe('World Boss summoning books (owner, 2026-11-13)', () => {
  it('one book per map with a World Boss, each a known item sold for Cash', () => {
    expect(Object.keys(WORLD_BOSS_BOOKS).sort()).toEqual(WORLD_BOSSES.map((b) => b.zoneId).sort())
    for (const itemId of Object.values(WORLD_BOSS_BOOKS)) {
      expect(getItem(itemId).name).toMatch(/Boss Summoning Book$/)
      const offer = CASH_OFFERS.find((o) => o.items[0]?.itemId === itemId)!
      // never cheaper than the Cash a World Boss gives back (its 100 Cash ticket)
      expect(offer.price).toBeGreaterThan(cashTicketValue(CASH_TICKET_100_ID)!)
    }
  })

  it("fills its own map's bar, takes the book and lets the boss be summoned there", () => {
    const dratan = 'lc-zone-4'
    const c = hero([WORLD_BOSS_BOOKS[dratan]!])
    const used = applyWorldBossBook(c, WORLD_BOSS_BOOKS[dratan]!)
    expect(used.inventory).toEqual([])
    expect(used.worldBoss!.kills[dratan]).toBe(worldBossFor(dratan)!.killsRequired)
    // the hero hunts on Juno: that bar stays as it was
    expect(worldBossCharge(used)).toBe(0)
    const there = { ...used, location: { zoneId: dratan, monsterId: used.location.monsterId } }
    const fight = summonWorldBoss(there, 'enc', 2_000)
    expect(fight.worldBoss!.active!.assisted).toBeUndefined()
  })

  it('is refused on a full bar, during a boss fight and on an expedition', () => {
    const juno = 'lc-zone-0'
    const book = WORLD_BOSS_BOOKS[juno]!
    const full = applyWorldBossBook(hero([book, book]), book)
    expect(() => applyWorldBossBook(full, book)).toThrow(/world-boss-ready/)
    const away = { ...hero([book]), expedition: { zoneId: juno, monsterId: 'x', startedAt: 0 } }
    expect(() => applyWorldBossBook(away, book)).toThrow(/world-boss-unavailable/)
    expect(() => applyWorldBossBook(hero([]), book)).toThrow(/not-owned/)
    expect(() => applyWorldBossBook(hero([972]), 972)).toThrow(/not-a-book/)
  })
})
