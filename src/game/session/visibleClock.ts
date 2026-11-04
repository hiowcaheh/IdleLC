/** Keeps all visible play time; rendering may consume a backlog over several frames. */
export const SIMULATION_STEP = 0.05

export class VisibleClock {
  private previous: number | null = null
  private pending = 0
  private visible = true

  reset(now: number): void {
    this.previous = now
    this.pending = 0
  }

  visibility(visible: boolean, now: number): void {
    if (this.visible && this.previous !== null)
      this.pending += Math.max(0, now - this.previous) / 1000
    this.visible = visible
    this.previous = visible ? now : null
  }

  read(now: number): number {
    if (!this.visible) return 0
    if (this.previous !== null) this.pending += Math.max(0, now - this.previous) / 1000
    this.previous = now
    const steps = Math.floor((Math.min(5, this.pending) + 1e-9) / SIMULATION_STEP)
    const seconds = steps * SIMULATION_STEP
    this.pending = Math.max(0, this.pending - seconds)
    return seconds
  }
}
