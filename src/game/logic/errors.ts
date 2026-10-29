/** A refused command. `code` is stable (UI messages, tests); the message adds details. */
export class GameError extends Error {
  readonly code: string
  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'GameError'
    this.code = code
  }
}
