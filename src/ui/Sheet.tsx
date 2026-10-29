import { useEffect, useRef, type ReactNode } from 'react'

/** Bottom sheet (centered dialog on wide screens) that closes on Escape and backdrop taps. */
export function Sheet({
  title,
  titleId,
  extra,
  onClose,
  children,
}: {
  title: string
  titleId: string
  /** Shown in the header between the title and the close button. */
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
        className="sheet"
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
          {extra}
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6 L18 18 M18 6 L6 18" />
            </svg>
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}
