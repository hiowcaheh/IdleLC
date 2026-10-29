import { Component, type ReactNode } from 'react'

/** Simple stand-in when a model can't be loaded (offline, missing file). */
export function ModelFallback() {
  return (
    <mesh position-y={0.9} castShadow>
      <capsuleGeometry args={[0.35, 1.1, 4, 12]} />
      <meshStandardMaterial color="#8a7a66" roughness={0.8} />
    </mesh>
  )
}

interface Props {
  children: ReactNode
  /** Another model (a new key) gets a fresh try. */
  resetKey: string
}

/**
 * Keeps the game running when a model fails to load: only that model is replaced by a stand-in,
 * the fight and the HUD go on.
 */
export class ModelBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('[scene] model failed to load', error instanceof Error ? error.message : error)
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false })
  }

  render() {
    return this.state.failed ? <ModelFallback /> : this.props.children
  }
}
