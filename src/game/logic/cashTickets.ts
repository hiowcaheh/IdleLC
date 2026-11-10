/** Consumes one ticket and credits the account in the same saved operation. */
import { cashTicketValue } from '../data/cashTickets.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'
import { takeFromInventory } from './loot.ts'

export interface CashTicketUse {
  character: CharacterData
  cash: number
  credited: number
}

export function applyCashTicket(
  character: CharacterData,
  cash: number,
  itemId: number,
): CashTicketUse {
  const credited = cashTicketValue(itemId)
  if (!credited) throw new GameError('not-a-cash-ticket')
  if (!Number.isSafeInteger(cash) || cash < 0 || !Number.isSafeInteger(cash + credited))
    throw new GameError('cash-limit', 'The Cash balance is too high.')
  const { inventory, taken } = takeFromInventory(character.inventory, [{ itemId, count: 1 }])
  if (taken[0]?.count !== 1) throw new GameError('not-enough-items')
  return { character: { ...character, inventory }, cash: cash + credited, credited }
}
