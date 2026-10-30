import { createPortal } from 'react-dom'
import { useToasts } from '../state/toasts.ts'

/** The messages of the windows' actions, sliding across the screen over everything else. */
export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  return createPortal(
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <p key={t.id} className={`toast toast--${t.tone}`}>
          {t.content}
        </p>
      ))}
    </div>,
    document.body,
  )
}
