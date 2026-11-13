/**
 * World Boss summoning books (own items, owner's request 2026-11-13, sold in the Cash shop): one
 * use fills the World Boss bar of its map at once, as the watched kills there would. The boss is
 * then summoned on that map as usual; the book is no dev help, so the try counts as a normal one.
 */
export const WORLD_BOSS_BOOKS: Readonly<Record<string, number>> = {
  'lc-zone-0': 95031, // Juno
  'lc-zone-4': 95032, // Dratan
  'lc-zone-7': 95033, // Merac
  'lc-zone-15': 95034, // Egeha
}

/** The map a summoning book fills, or undefined for any other item. */
export function bookZone(itemId: number): string | undefined {
  return Object.entries(WORLD_BOSS_BOOKS).find(([, id]) => id === itemId)?.[0]
}
