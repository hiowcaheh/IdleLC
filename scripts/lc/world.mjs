/**
 * Models placed on a map by its world file (`.wld`, Serious Engine): the placement table (`ENs2`:
 * id, class, position, heading / pitch / banking per entity), the entity states (`ENT5`) and the
 * file dictionary at the end (`DICT`: classes, .smc files…). Only ModelHolder3 entities (SKA models:
 * trees, grass, walls, houses) are read: their model file (property 0xf201, a dictionary index)
 * and the model instance's stretch (`MI03` … `MISF` name + 3 floats). See docs/lc-formats.md.
 */

const tag = (buf, at) => buf.toString('latin1', at, at + 4)

/** The file dictionary: the last DICT block (the entities' one). */
function readDictionary(buf) {
  const at = buf.lastIndexOf('DICT', buf.length, 'latin1')
  if (at < 0) return { at: buf.length, names: [] }
  const count = buf.readUInt32LE(at + 4)
  const names = []
  let p = at + 8
  for (let i = 0; i < count && tag(buf, p) === 'DFNM'; i++) {
    const length = buf.readUInt32LE(p + 4)
    names.push(buf.toString('latin1', p + 8, p + 8 + length))
    p += 8 + length
  }
  return { at, names }
}

/** Model file property of a ModelHolder3 (type 8 = file name, id 0xf201). */
const MODEL_FILE = Buffer.from([0x08, 0x01, 0xf2, 0x00])

/**
 * Placed models: { smc (client path), x, y, z (map metres), heading, pitch, banking (degrees),
 * stretch [x, y, z] }.
 */
export function parseWorldModels(buf) {
  const table = buf.indexOf('ENs2', 0, 'latin1')
  if (table < 0) throw new Error('no entity placement table (ENs2)')
  const count = buf.readUInt32LE(table + 4)
  const placements = new Map()
  for (let k = 0; k < count; k++) {
    const p = table + 8 + k * 32
    placements.set(buf.readUInt32LE(p), {
      x: buf.readFloatLE(p + 8),
      y: buf.readFloatLE(p + 12),
      z: buf.readFloatLE(p + 16),
      heading: buf.readFloatLE(p + 20),
      pitch: buf.readFloatLE(p + 24),
      banking: buf.readFloatLE(p + 28),
    })
  }
  const dictionary = readDictionary(buf)
  const models = []
  let at = buf.indexOf('ENT5', table, 'latin1')
  while (at >= 0 && at < dictionary.at) {
    const next = buf.indexOf('ENT5', at + 4, 'latin1')
    const end = next < 0 ? dictionary.at : next
    const record = buf.subarray(at, end)
    const placement = placements.get(buf.readUInt32LE(at + 4))
    const file = record.indexOf(MODEL_FILE)
    const smc = file >= 0 ? dictionary.names[record.readUInt32LE(file + 4)] : undefined
    if (placement && smc && /\.smc$/i.test(smc)) {
      const instance = record.indexOf('MI03MISF', 0, 'latin1')
      let stretch = [1, 1, 1]
      if (instance >= 0) {
        const nameLength = record.readUInt32LE(instance + 12)
        const s = instance + 16 + nameLength + 4
        stretch = [record.readFloatLE(s), record.readFloatLE(s + 4), record.readFloatLE(s + 8)]
      }
      models.push({ smc, ...placement, stretch })
    }
    at = next
  }
  return models
}
