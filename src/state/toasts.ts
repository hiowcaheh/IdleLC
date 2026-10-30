import type { ReactNode } from 'react'
import { create } from 'zustand'

export interface Toast {
  id: number
  content: ReactNode
  tone: 'info' | 'error'
}

/** How long a message takes to slide across the screen (keep in step with the CSS animation). */
export const TOAST_MS = 2800
const MAX_SHOWN = 3

interface ToastStore {
  toasts: Toast[]
  show(content: ReactNode, tone?: Toast['tone']): void
  dismiss(id: number): void
}

let nextId = 1

/** Messages sliding across the screen: what an action in a window did (sold, worn, upgraded…). */
export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  show(content, tone = 'info') {
    const id = nextId++
    set({ toasts: [...get().toasts, { id, content, tone }].slice(-MAX_SHOWN) })
    setTimeout(() => get().dismiss(id), TOAST_MS)
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },
}))

export const toast = (content: ReactNode, tone?: Toast['tone']) =>
  useToasts.getState().show(content, tone)
