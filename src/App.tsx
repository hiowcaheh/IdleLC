import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { useDevTools } from './ui/dev/devMode.ts'
import { GameScreen } from './ui/GameScreen.tsx'

const ModelViewer = lazy(() =>
  import('./ui/dev/ModelViewer.tsx').then((m) => ({ default: m.ModelViewer })),
)

export default function App() {
  const devTools = useDevTools((s) => s.enabled)
  return (
    <Routes>
      <Route path="/" element={<GameScreen />} />
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
  )
}
