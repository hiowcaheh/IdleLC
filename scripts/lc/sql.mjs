/**
 * Minimal MySQL dump reader: CREATE TABLE column names + INSERT ... VALUES tuples.
 * Only the requested tables are materialized; others are skipped while respecting quoting.
 */

/** Column names of every CREATE TABLE in the dump. */
export function readSchemas(text) {
  const schemas = {}
  const re = /CREATE TABLE `(\w+)` \(([\s\S]*?)\n\)/g
  for (let m; (m = re.exec(text));) {
    schemas[m[1]] = [...m[2].matchAll(/^\s*`(\w+)`/gm)].map((c) => c[1])
  }
  return schemas
}

const ESCAPES = { n: '\n', r: '\r', t: '\t', 0: '\0', Z: '\x1a' }

/** Parses `(…),(…);` starting at `i`; returns rows (arrays) and the index after the `;`. */
export function parseValues(text, i) {
  const rows = []
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (c === ';') return { rows, end: i + 1 }
    if (c !== '(') {
      i++
      continue
    }
    i++
    const row = []
    for (;;) {
      while (text[i] === ' ' || text[i] === '\n' || text[i] === '\t' || text[i] === '\r') i++
      if (text[i] === "'") {
        i++
        let buf = ''
        for (;;) {
          const ch = text[i]
          if (ch === '\\') {
            const next = text[i + 1]
            buf += ESCAPES[next] ?? next
            i += 2
          } else if (ch === "'") {
            if (text[i + 1] === "'") {
              buf += "'"
              i += 2
            } else {
              i++
              break
            }
          } else {
            buf += ch
            i++
          }
        }
        row.push(buf)
      } else {
        let j = i
        while (text[j] !== ',' && text[j] !== ')') j++
        const token = text.slice(i, j).trim()
        i = j
        if (token.toUpperCase() === 'NULL') row.push(null)
        else {
          const num = Number(token)
          row.push(Number.isNaN(num) ? token : num)
        }
      }
      while (text[i] === ' ' || text[i] === '\n') i++
      if (text[i] === ',') {
        i++
        continue
      }
      if (text[i] === ')') {
        i++
        break
      }
      throw new Error(`Unexpected "${text[i]}" at ${i}`)
    }
    rows.push(row)
  }
  return { rows, end: i }
}

/**
 * Returns { table: rowObjects[] } for the requested tables. Table names are matched ignoring case:
 * the LC dump creates `t_skillLevel` but inserts into `t_skilllevel` (MySQL on Windows).
 */
export function readTables(text, wanted) {
  const schemas = Object.fromEntries(
    Object.entries(readSchemas(text)).map(([name, cols]) => [name.toLowerCase(), cols]),
  )
  const want = new Map(wanted.map((t) => [t.toLowerCase(), t]))
  const out = Object.fromEntries(wanted.map((t) => [t, []]))
  const re = /INSERT INTO `(\w+)`(?: \([^)]*\))? VALUES /g
  for (let m; (m = re.exec(text));) {
    const { rows, end } = parseValues(text, re.lastIndex)
    re.lastIndex = end
    const table = want.get(m[1].toLowerCase())
    if (!table) continue
    const cols = schemas[m[1].toLowerCase()]
    if (!cols) throw new Error(`No CREATE TABLE for ${m[1]}`)
    for (const row of rows) out[table].push(Object.fromEntries(cols.map((c, k) => [c, row[k]])))
  }
  return out
}

/** Numbers in LC dumps are sometimes stored as text. */
export const int = (v) =>
  v === null || v === undefined || v === '' ? 0 : Math.trunc(Number(v)) || 0
export const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0)
