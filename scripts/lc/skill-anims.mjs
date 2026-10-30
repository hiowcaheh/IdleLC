/**
 * Skill animations of the classes from the client's skill table (`Data\skills.lod`, readable): a
 * record per skill holds the clips the hero plays — one clip for most skills, three phases for
 * spells (`hw_skill_02_1` wind-up, `_2` held, `_3` release) — the effect names (those live in the
 * encrypted `Effect.dat`) and an alternative set for the class's second weapon kind (`*_a_*`).
 *
 * The record layout is only partly known: the skill id sits 102 bytes before the first clip name
 * (90 bytes for three-phase spells). Clip names are length-prefixed strings that start with the
 * class prefix, so a name is taken for a skill only when its class prefix matches.
 */

/** Length-prefixed (u32) ASCII names that start with a class prefix: [offset, name]. */
function* clipNames(buffer, prefixes) {
  const text = buffer.toString('latin1')
  const pattern = new RegExp(
    `([\\x04-\\x30])\\x00\\x00\\x00((?:${prefixes.join('|')})_[A-Za-z0-9_]+)`,
    'g',
  )
  let m
  while ((m = pattern.exec(text))) {
    if (m[1].charCodeAt(0) === m[2].length) yield [m.index, m[2]]
  }
}

const HEADERS = [102, 90]

/**
 * @param buffer   skills.lod
 * @param skills   [{ id, classId }] — the skills to look for
 * @param prefixes classId → clip prefix ('ni', 'ti'…)
 * @returns Map skill id → { fire } or { ready, still, fire } (clip names as the .ba files spell them)
 */
export function parseSkillAnims(buffer, skills, prefixes) {
  const byId = new Map(skills.map((s) => [s.id, s]))
  const found = new Map()
  const all = Object.values(prefixes)
  const names = [...clipNames(buffer, all)]
  names.forEach(([offset, name], i) => {
    for (const head of HEADERS) {
      if (offset < head) continue
      const skill = byId.get(buffer.readUInt32LE(offset - head))
      if (!skill || found.has(skill.id)) continue
      if (!name.toLowerCase().startsWith(`${prefixes[skill.classId]}_`)) continue
      // the phases follow right after (the alternative set, `*_a_*`, comes later)
      const phases = [name]
      for (const [next, other] of names.slice(i + 1)) {
        if (next > offset + 80 || phases.length === 3) break
        if (!/_a_/i.test(other)) phases.push(other)
      }
      const spell =
        phases.length === 3 &&
        /_1$/.test(phases[0]) &&
        /_2$/.test(phases[1]) &&
        /_3$/.test(phases[2])
      found.set(
        skill.id,
        spell ? { ready: phases[0], still: phases[1], fire: phases[2] } : { fire: name },
      )
      break
    }
  })
  return found
}
