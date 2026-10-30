interface Props {
  value: number
  max: number
  variant: 'hp' | 'mp' | 'exp'
  label?: string
  /** Printed on the bar instead of "value / max". */
  text?: string
}

/** Resource bar with the numbers printed on it; the fill is cut, not squeezed, as it empties. */
export function Bar({ value, max, variant, label, text }: Props) {
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
      <div className="bar__fill" style={{ clipPath: `inset(0 ${(1 - ratio) * 100}% 0 0)` }} />
      <span className="bar__text">{text ?? `${value} / ${max}`}</span>
    </div>
  )
}
