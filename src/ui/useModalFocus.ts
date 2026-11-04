import { useEffect, useEffectEvent, type RefObject } from 'react'

const focusable = 'button, a[href], input, select, textarea, [tabindex]'

/** Only the top window handles keys; nested windows restore focus to their opener. */
export function useModalFocus(
  dialog: RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled = true,
): void {
  const close = useEffectEvent(onClose)
  useEffect(() => {
    const root = dialog.current
    if (!enabled || !root) return
    const previous = document.activeElement
    const top = () => [...document.querySelectorAll('.sheet')].at(-1) === root
    const elements = () =>
      [...root.querySelectorAll<HTMLElement>(focusable)].filter(
        (el) => el.tabIndex >= 0 && !el.matches(':disabled') && el.getClientRects().length > 0,
      )
    const onKey = (event: KeyboardEvent) => {
      if (!top()) return
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      } else if (event.key === 'Tab') {
        const items = elements()
        const first = items[0] ?? root
        const last = items.at(-1) ?? root
        const active = document.activeElement
        if (
          !root.contains(active) ||
          active === root ||
          (event.shiftKey ? active === first : active === last)
        ) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus()
        }
      }
    }
    const onFocus = (event: FocusEvent) => {
      if (top() && event.target instanceof Node && !root.contains(event.target)) {
        ;(elements()[0] ?? root).focus()
      }
    }
    root.focus()
    window.addEventListener('keydown', onKey)
    document.addEventListener('focusin', onFocus)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocus)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [dialog, enabled])
}
