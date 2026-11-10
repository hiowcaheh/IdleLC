/** Cash denominations requested by the owner (2026-11-10), using the client's Ticket icon. */
export const CASH_TICKETS = [
  { itemId: 95011, cash: 10 },
  { itemId: 95012, cash: 20 },
  { itemId: 95013, cash: 50 },
  { itemId: 95014, cash: 100 },
  { itemId: 95015, cash: 500 },
  { itemId: 95016, cash: 1000 },
] as const

export const CASH_TICKET_100_ID = 95014
export const cashTicketValue = (itemId: number): number =>
  CASH_TICKETS.find((ticket) => ticket.itemId === itemId)?.cash ?? 0
