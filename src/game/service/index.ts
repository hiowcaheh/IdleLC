import type { GameService, KeyValueStorage } from './GameService.ts'
import { LocalGameService } from './LocalGameService.ts'

function browserStorage(): KeyValueStorage {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // access denied (e.g. disabled cookies)
  }
  const memory = new Map<string, string>()
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => void memory.set(key, value),
    removeItem: (key) => void memory.delete(key),
  }
}

/** App-wide game service. Swap the implementation here in stage 2. */
export const gameService: GameService = new LocalGameService(browserStorage())

export type { GameService } from './GameService.ts'
