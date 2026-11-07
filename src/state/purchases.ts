import type { ItemStack } from '../game/logic/loot.ts'

type Listener = (items: readonly ItemStack[]) => void
const listeners = new Set<Listener>()

/** Items bought in the Cash shop, for the list on the left of the screen (ui/cashShop). */
export const purchaseFeed = {
  emit(items: readonly ItemStack[]): void {
    for (const listener of listeners) listener(items)
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
