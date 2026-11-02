/** Prefer canonical animation sets; legacy encrypted clients may require a readable substitute. */
import { parseAnimSet } from './ska.mjs'

export function chooseAnimSets(files, preferred, fallback = []) {
  const readable = (sets) =>
    sets.length > 0 &&
    sets.every((file) => {
      try {
        const bytes = files.read(file)
        const parsed = parseAnimSet(bytes)
        return parsed.end === bytes.length && parsed.anims.length > 0
      } catch {
        return false
      }
    })
  if (readable(preferred)) return preferred
  if (readable(fallback)) return fallback
  // Let the normal converter report missing/unsupported files rather than hide the cause.
  return preferred
}
