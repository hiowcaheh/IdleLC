/**
 * Keeps the page at its size: iOS Safari ignores `user-scalable=no` and zooms on pinch, so the pinch
 * gestures (Safari's gesture events, two-finger moves) and double taps are cancelled here.
 */
export function lockZoom(target: Document = document): void {
  const cancel = (event: Event) => event.preventDefault()
  for (const type of ['gesturestart', 'gesturechange', 'gestureend'])
    target.addEventListener(type, cancel, { passive: false })
  target.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) event.preventDefault()
    },
    { passive: false },
  )
  target.addEventListener('dblclick', cancel, { passive: false })
}
