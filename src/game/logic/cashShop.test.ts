import { describe, expect, it, vi } from 'vitest'

vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
}))

import { CASH_OFFERS, CASH_TABS } from '../data/cashShop.ts'
import { ITEMS } from '../data/items.ts'
import { applyCashBuy, sanitizeCash } from './cashShop.ts'
import { createCharacterData } from './character.ts'
import { loadSave } from './save.ts'

const NOW = Date.UTC(2026, 10, 7, 12)
const hero = () => createCharacterData({ name: 'Buyer', classId: 'mage' }, 'c', NOW)

describe('Cash item shop (owner, 2026-11-07)', () => {
  it('sells only known items, every tab has offers, ids are unique', () => {
    for (const offer of CASH_OFFERS) {
      expect(offer.price).toBeGreaterThan(0)
      for (const item of offer.items) expect(ITEMS[item.itemId], `${offer.id}`).toBeDefined()
    }
    for (const tab of CASH_TABS) expect(CASH_OFFERS.some((o) => o.tabs.includes(tab.id))).toBe(true)
    expect(new Set(CASH_OFFERS.map((o) => o.id)).size).toBe(CASH_OFFERS.length)
  })

  it('takes the Cash and puts the offer in the bag, times the count', () => {
    const bought = applyCashBuy(hero(), 20000, 'proficiency-package', 2)
    expect(bought.cash).toBe(20000 - 2 * 9900)
    expect(bought.items).toEqual([
      { itemId: 1288, count: 4 },
      { itemId: 2453, count: 10 },
      { itemId: 2138, count: 2 },
    ])
    expect(bought.character.inventory.find((s) => s.itemId === 2453)?.count).toBe(10)
    expect(() => applyCashBuy(hero(), 9899, 'proficiency-package', 1)).toThrow(/cash/)
    expect(() => applyCashBuy(hero(), 1e9, 'nothing', 1)).toThrow()
  })

  it('keeps the account Cash in the save; older v16 saves start with none', () => {
    expect(sanitizeCash(-5)).toBe(0)
    expect(sanitizeCash(12.9)).toBe(12)
    const stored = loadSave(
      JSON.stringify({ saveVersion: 16, createdAt: NOW, characters: [] }),
      NOW,
    )
    expect(stored.save.cash).toBe(0)
    const kept = loadSave(JSON.stringify({ ...stored.save, cash: 3000 }), NOW)
    expect(kept.save.cash).toBe(3000)
  })
})
