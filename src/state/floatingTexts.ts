import { create } from 'zustand'

export type FloatingKind = 'dealt' | 'crit' | 'taken' | 'miss' | 'exp' | 'gold' | 'level' | 'loot'

export interface FloatingText {
  id: number
  text: string
  kind: FloatingKind
  position: [number, number, number]
}

const LIFETIME_MS = 1100
const MAX_ALIVE = 14

interface FloatingTextStore {
  items: FloatingText[]
  add(text: string, kind: FloatingKind, position: [number, number, number]): void
  clear(): void
}

let nextId = 1

/** Damage numbers that float above characters (rendered by DamageNumbers). */
export const useFloatingTexts = create<FloatingTextStore>((set) => ({
  items: [],
  add(text, kind, position) {
    const id = nextId++
    set((s) => ({ items: [...s.items, { id, text, kind, position }].slice(-MAX_ALIVE) }))
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), LIFETIME_MS)
  },
  clear() {
    set({ items: [] })
  },
}))
