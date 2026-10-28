import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { DEV_MODE } from './ui/dev/devMode.ts'
import { GameScreen } from './ui/GameScreen.tsx'

const ModelViewer = lazy(() =>
  import('./ui/dev/ModelViewer.tsx').then((m) => ({ default: m.ModelViewer })),
)

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<GameScreen />} />
      {DEV_MODE && (
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
