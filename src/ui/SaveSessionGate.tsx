import { useEffect, useState, type ReactNode } from 'react'
import { startSaveSession, type SaveSessionState } from '../game/service/saveSession.ts'

export function SaveSessionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SaveSessionState>('checking')
  useEffect(() => startSaveSession(setState), [])
  if (state === 'active') return children
  return (
    <main className="screen">
      <div className="screen__column" role="status">
        <h1 className="screen__logo">IdleLC</h1>
        {state === 'checking' ? (
          <p>Opening your game…</p>
        ) : (
          <>
            <h2>
              {state === 'blocked'
                ? 'Your game is already open'
                : 'Your game changed in another tab'}
            </h2>
            <p>Close the other game tab to continue here with your latest progress.</p>
            <button
              className="button button--primary"
              type="button"
              onClick={() => location.reload()}
            >
              Try again
            </button>
          </>
        )}
      </div>
    </main>
  )
}
