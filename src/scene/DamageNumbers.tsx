import { Html } from '@react-three/drei'
import { useFloatingTexts } from '../state/floatingTexts.ts'

export function DamageNumbers() {
  const items = useFloatingTexts((s) => s.items)
  return (
    <>
      {items.map((item) => (
        <Html
          key={item.id}
          position={item.position}
          center
          pointerEvents="none"
          zIndexRange={[20, 10]}
        >
          <span className={`float-text float-text--${item.kind}`}>{item.text}</span>
        </Html>
      ))}
    </>
  )
}
