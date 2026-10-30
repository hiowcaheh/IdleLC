/**
 * `.smc` model descriptor (text): meshes with their textures, skeleton, animation sets.
 *
 *   NAME "fox";
 *   {
 *     MESH TFNM "Data\Monster\Animals\Fox.bm";
 *     TEXTURES { "d1_animal" TFNM "Data\Monster\Animals\d1_animal.tex"; }
 *     SKELETON TFNM "Data\Monster\Animals\Fox.bs";
 *     ANIMSET TFNM "Data\Monster\Animals\Fox.ba";
 *   }
 */
export function parseSmc(text) {
  const model = {
    name: /NAME\s+"([^"]*)"/.exec(text)?.[1] ?? '',
    meshes: [],
    skeleton: null,
    animSets: [],
    offset: [0, 0, 0, 0, 0, 0],
    /** Box around every frame: min x, y, z, max x, y, z (metres), when the file has one. */
    bbox: null,
  }
  let current = null
  for (const raw of text.replace(/[{}]/g, '\n').split(/\r?\n/)) {
    const line = raw.trim()
    let m
    if ((m = /^MESH\s+TFNM\s+"([^"]+)"/.exec(line))) {
      current = { file: m[1], textures: {} }
      model.meshes.push(current)
    } else if ((m = /^"([^"]+)"\s+TFNM\s+"([^"]+)"/.exec(line)) && current) {
      current.textures[m[1]] = m[2]
    } else if ((m = /^SKELETON\s+TFNM\s+"([^"]+)"/.exec(line))) {
      model.skeleton = m[1]
    } else if ((m = /^ANIMSET\s+TFNM\s+"([^"]+)"/.exec(line))) {
      model.animSets.push(m[1])
    } else if ((m = /^OFFSET\s+([-\d.,\s]+);/.exec(line))) {
      model.offset = m[1].split(',').map(Number)
    } else if ((m = /^ALLFRAMESBBOX\s+([-\d.,\se]+);/.exec(line))) {
      model.bbox = m[1].split(',').map(Number)
    }
  }
  return model
}
