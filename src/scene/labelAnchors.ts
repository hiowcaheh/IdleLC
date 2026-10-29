/**
 * Names over the fighters and the monster's curses are plain HTML in an overlay above the canvas
 * (ui/hud/SceneLabels.tsx); the scene projects their 3D points each frame and moves them here.
 */
const elements = new Map<string, HTMLElement>()

export type SceneLabelId = 'player' | 'monster' | 'effects'

/** Ref callback target: the overlay element of a label (null when it unmounts). */
export function bindLabel(id: SceneLabelId, element: HTMLElement | null): void {
  if (element) elements.set(id, element)
  else elements.delete(id)
}

/** Puts a label at a point of the canvas (pixels from its top left), or hides it. */
export function placeLabel(id: SceneLabelId, x: number, y: number, visible: boolean): void {
  const element = elements.get(id)
  if (!element) return
  element.style.visibility = visible ? 'visible' : 'hidden'
  if (visible) element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
}
