import { describe, expect, it, vi } from 'vitest'

vi.mock('../data/lcSource.ts', async () => ({
  ...(await vi.importActual('../data/lcSource.ts')),
  lcData: (await import('../data/generated/lc-data.json')).default,
  lcModels: (await import('../data/generated/lc-models.json')).default,
  lcIcons: (await import('../data/generated/lc-icons.json')).default,
}))

import { CASH_TICKETS } from '../data/cashTickets.ts'
import { getItem, itemIcon } from '../data/items.ts'
import { applyCashTicket } from './cashTickets.ts'
import { createCharacterData } from './character.ts'

const hero = () => createCharacterData({ name: 'Ticket', classId: 'mage' }, 't', 1000)

describe('Cash tickets', () => {
  it('has all six denominations, real ticket icons and no gold sale value', () => {
    expect(CASH_TICKETS.map((t) => t.cash)).toEqual([10, 20, 50, 100, 500, 1000])
    for (const t of CASH_TICKETS) {
      expect(getItem(t.itemId).name).toBe(`${t.cash} Cash Ticket`)
      expect(getItem(t.itemId).price).toBe(0)
      expect(itemIcon(t.itemId)).toBeDefined()
    }
  })

  it('consumes one owned ticket and credits exactly its denomination without mutating input', () => {
    for (const t of CASH_TICKETS) {
      const c = { ...hero(), inventory: [{ itemId: t.itemId, count: 2 }] }
      const use = applyCashTicket(c, 17, t.itemId)
      expect(use.cash).toBe(17 + t.cash)
      expect(use.credited).toBe(t.cash)
      expect(use.character.inventory).toEqual([{ itemId: t.itemId, count: 1 }])
      expect(c.inventory[0]!.count).toBe(2)
    }
  })

  it('cannot redeem an absent, spent or unknown ticket, or overflow the balance', () => {
    const c = { ...hero(), inventory: [{ itemId: 95014, count: 1 }] }
    const first = applyCashTicket(c, 0, 95014)
    expect(() => applyCashTicket(first.character, first.cash, 95014)).toThrow('not-enough-items')
    expect(() => applyCashTicket(c, 0, 95016)).toThrow('not-enough-items')
    expect(() => applyCashTicket(c, 0, 85)).toThrow('not-a-cash-ticket')
    expect(() => applyCashTicket(c, Number.MAX_SAFE_INTEGER, 95014)).toThrow('cash-limit')
    expect(c.inventory[0]!.count).toBe(1)
  })
})
