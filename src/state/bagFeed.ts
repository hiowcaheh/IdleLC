import type { ItemStack } from '../game/logic/loot.ts'

type Listener = (items: readonly ItemStack[]) => void
const listeners = new Set<Listener>()

/**
 * Items that just reached the bag outside a fight (bought in the Cash shop, out of opened boxes), for
 * the list on the left of the screen (ui/items/BagFeed).
 */
export const bagFeed = {
  emit(items: readonly ItemStack[]): void {
    for (const listener of listeners) listener(items)
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
