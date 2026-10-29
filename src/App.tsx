import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { useGameStore } from './state/gameStore.ts'
import { CharacterSelectScreen } from './ui/characters/CharacterSelectScreen.tsx'
import { CreateCharacterScreen } from './ui/characters/CreateCharacterScreen.tsx'
import { useDevTools } from './ui/dev/devMode.ts'
import { GameScreen } from './ui/GameScreen.tsx'
import { LoadNotice } from './ui/LoadNotice.tsx'

const ModelViewer = lazy(() =>
  import('./ui/dev/ModelViewer.tsx').then((m) => ({ default: m.ModelViewer })),
)

export default function App() {
  const ready = useGameStore((s) => s.ready)
  const playing = useGameStore((s) => s.character !== null)
  const devTools = useDevTools((s) => s.enabled)

  useEffect(() => {
    void useGameStore.getState().init()
  }, [])

  if (!ready) {
    return (
      <div className="loading" role="status">
        <p className="loading__text">Loading…</p>
      </div>
    )
  }

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={playing ? <GameScreen /> : <Navigate to="/characters" replace />}
        />
        <Route path="/characters" element={<CharacterSelectScreen />} />
        <Route path="/characters/new" element={<CreateCharacterScreen />} />
        {devTools && (
          <Route
            path="/dev/models"
            element={
              <Suspense fallback={null}>
                <ModelViewer />
              </Suspense>
            }
          />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <LoadNotice />
    </>
  )
}
