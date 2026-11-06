import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/**
 * A row that scrolls sideways instead of wrapping: the side with more fades out under the
 * client's page arrow, which scrolls on a tap. `className` styles the scrolling track.
 */
export function ScrollStrip({
  className = '',
  label,
  children,
}: {
  className?: string
  label?: string
  children: ReactNode
}) {
  const track = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ left: false, right: false })
  const measure = useCallback(() => {
    const el = track.current
    if (!el) return
    const left = el.scrollLeft > 1
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setMore((was) => (was.left === left && was.right === right ? was : { left, right }))
  }, [])
  useLayoutEffect(() => {
    measure()
    const el = track.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    for (const child of el.children) observer.observe(child)
    return () => observer.disconnect()
  }, [measure, children])
  const scrollBy = (direction: 1 | -1) =>
    track.current?.scrollBy({
      left: direction * track.current.clientWidth * 0.8,
      behavior: 'smooth',
    })
  return (
    <div
      className={`scroll-strip${more.left ? ' has-more-left' : ''}${more.right ? ' has-more-right' : ''}`}
    >
      <div
        ref={track}
        className={`scroll-strip__track ${className}`}
        role={label ? 'group' : undefined}
        aria-label={label}
        onScroll={measure}
      >
        {children}
      </div>
      {more.left && (
        <button
          type="button"
          className="scroll-strip__more scroll-strip__more--left"
          aria-label="Scroll left"
          onClick={() => scrollBy(-1)}
        />
      )}
      {more.right && (
        <button
          type="button"
          className="scroll-strip__more scroll-strip__more--right"
          aria-label="Scroll right"
          onClick={() => scrollBy(1)}
        />
      )}
    </div>
  )
}
