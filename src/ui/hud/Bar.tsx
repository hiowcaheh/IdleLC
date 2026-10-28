interface Props {
  value: number
  max: number
  variant: 'hp' | 'enemy'
  label?: string
}

/** Glossy MMO-style resource bar with the numbers printed on it. */
export function Bar({ value, max, variant, label }: Props) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return (
    <div
      className={`bar bar--${variant}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div className="bar__fill" style={{ transform: `scaleX(${ratio})` }} />
      <span className="bar__text">
        {value} / {max}
      </span>
    </div>
  )
}
