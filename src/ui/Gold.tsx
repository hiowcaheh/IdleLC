import { Fragment, type ReactNode } from 'react'
import { goldColor } from './gold.ts'

/** Every price and balance uses the client's coin and magnitude colour together. */
export function Gold({ amount, prefix = '' }: { amount: number; prefix?: string }) {
  const text = Math.round(amount).toLocaleString('en-US')
  return (
    <span
      className="gold"
      style={{ color: goldColor(amount) }}
      aria-label={`${prefix}${text} gold`}
    >
      <span className="coin coin--small" aria-hidden="true" />
      <span>
        {prefix}
        {text}
      </span>
    </span>
  )
}

/** Action messages are supplied as prose by the windows; keep their money equally readable. */
export function GoldMessage({ children }: { children: ReactNode }) {
  if (typeof children !== 'string') return children
  const parts = children.split(/([+−-]?\d[\d,]*(?:\.\d+)? gold)\b/g)
  return parts.map((part, index) => {
    const match = /^([+−-]?)([\d,.]+) gold$/.exec(part)
    return match ? (
      <Gold key={index} prefix={match[1]} amount={Number(match[2]!.replaceAll(',', ''))} />
    ) : (
      <Fragment key={index}>{part}</Fragment>
    )
  })
}
