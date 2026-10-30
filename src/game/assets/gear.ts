/**
 * What worn weapons and armor look like on the character: each piece with a converted model
 * (lc-gear.json, `npm run convert-lc`) puts its meshes on the class body and covers the body parts
 * it replaces (the shirt under an armor, the hair under a helmet).
 */
import { lcGear } from '../data/lcSource.ts'
import { getItem } from '../data/items.ts'
import type { GearSlot } from '../data/types.ts'

/** One worn piece to show: its model and the slot it is worn in. */
export interface GearLook {
  url: string
  slot: GearSlot
}

/** The body part every slot covers (class model meshes `ni_hair_000`, `ni_bu_000`…). */
const SLOT_PARTS: Partial<Record<GearSlot, string>> = {
  helmet: 'hair',
  armor: 'bu',
  pants: 'bd',
  gloves: 'hn',
  boots: 'ft',
}

const FILES = new Map<number, string>()
for (const { file, items } of Object.values(lcGear?.models ?? {})) {
  for (const id of items) FILES.set(id, `${import.meta.env.BASE_URL}${lcGear!.baseUrl}${file}`)
}

/** The model of an item, or null when it shows nothing (no model converted, accessories). */
export function gearModelUrl(itemId: number): string | null {
  return FILES.get(itemId) ?? null
}

/** The pieces to show for the worn items. */
export function gearLooks(itemIds: Iterable<number>): GearLook[] {
  const looks: GearLook[] = []
  for (const id of itemIds) {
    const url = gearModelUrl(id)
    const slot = getItem(id).gear?.slot
    if (url && slot && slot !== 'accessory') looks.push({ url, slot })
  }
  return looks
}

/** Body part of a class model mesh (`ni_bu_000` → `bu`, `hw_bs_001_1` → `bs`), or null. */
export function bodyPart(meshName: string): string | null {
  return /^[a-z]{2}_([a-z]+)/i.exec(meshName)?.[1]?.toLowerCase() ?? null
}

/** Body parts a worn piece covers: its slot's part and the parts its own meshes are made of. */
export function coveredParts(slot: GearSlot, meshNames: Iterable<string>): Set<string> {
  const parts = new Set<string>()
  const own = SLOT_PARTS[slot]
  if (own) parts.add(own)
  for (const name of meshNames) {
    const part = bodyPart(name)
    if (part) parts.add(part)
  }
  return parts
}
