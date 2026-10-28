import { useProgress } from '@react-three/drei'

export function LoadingOverlay() {
  const { active, progress } = useProgress()
  if (!active) return null
  return (
    <div className="loading" role="status">
      <p className="loading__text">Loading models…</p>
      <div className="loading__track">
        <div className="loading__fill" style={{ transform: `scaleX(${progress / 100})` }} />
      </div>
    </div>
  )
}
