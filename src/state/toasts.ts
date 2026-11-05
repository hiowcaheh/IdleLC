import type { ReactNode } from 'react'
import { create } from 'zustand'

export interface Toast {
  id: number
  content: ReactNode
  tone: 'info' | 'error'
  /** How long it stays (ms); longer for messages with stat changes to read. */
  ms: number
}

/** How long a message takes to slide across the screen (keep in step with the CSS animation). */
export const TOAST_MS = 2800
const MAX_SHOWN = 3

interface ToastStore {
  toasts: Toast[]
  show(content: ReactNode, tone?: Toast['tone'], ms?: number): void
  dismiss(id: number): void
}

let nextId = 1

/** Messages sliding across the screen: what an action in a window did (sold, worn, upgraded…). */
export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  show(content, tone = 'info', ms = TOAST_MS) {
    const id = nextId++
    set({ toasts: [...get().toasts, { id, content, tone, ms }].slice(-MAX_SHOWN) })
    setTimeout(() => get().dismiss(id), ms)
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },
}))

export const toast = (content: ReactNode, tone?: Toast['tone'], ms?: number) =>
  useToasts.getState().show(content, tone, ms)

/** Messages listing stat changes stay this long, to be read. */
export const STAT_TOAST_MS = 4600
