import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A window in the client's frame: bottom sheet (centered dialog on wide screens) with the title in
 * the frame's top edge and the close button on its corner; only the body scrolls. Closes on Escape
 * and backdrop taps.
 */
export function Sheet({
  title,
  titleId,
  extra,
  onClose,
  children,
}: {
  title: string
  titleId: string
  /** Shown at the top of the window, on the right (e.g. the gold or skill points to spend). */
  extra?: ReactNode
  onClose(): void
  children: ReactNode
}) {
  const dialog = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    dialog.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={dialog}
        className="sheet sheet--framed"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet__header">
          <h2 id={titleId} className="sheet__title">
            {title}
          </h2>
          <button
            type="button"
            className="icon-button sheet__close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6 L18 18 M18 6 L6 18" />
            </svg>
          </button>
        </header>
        <div className="sheet__body">
          {extra && <div className="sheet__extra">{extra}</div>}
          {children}
        </div>
      </div>
    </div>
  )
}
