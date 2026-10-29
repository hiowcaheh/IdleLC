import { CLASS_ORDER } from './classes.ts'
import { iconSprite, type IconSprite } from './icons.ts'
import { lcData, lcIcons } from './lcSource.ts'
import type { LcItem } from './lcTypes.ts'
import type { ClassId, EquipSlot, GearDef, ItemDef, ItemType } from './types.ts'

/** t_item.a_type_idx → item type (see docs/lc-database.md). */
const LC_TYPES: Record<number, ItemType> = {
  0: 'weapon',
  1: 'armor',
  2: 'scroll',
  4: 'material',
  5: 'accessory',
  6: 'potion',
}

/** t_item.a_wearing → slot. */
export const SLOTS_BY_WEARING: EquipSlot[] = [
  'helmet',
  'armor',
  'weapon',
  'pants',
  'shield',
  'gloves',
  'boots',
]

/** Display order of the slots. */
export const EQUIP_SLOTS: EquipSlot[] = [
  'weapon',
  'shield',
  'helmet',
  'armor',
  'pants',
  'gloves',
  'boots',
]

/** t_item 84 "Smelting Stone": upgrades weapons and armor by one (drops, see logic/loot.ts). */
export const UPGRADE_STONE_ID = 84
/** t_item 85 "Heaven Stone": the upgrade stone the Juno shop sells. */
export const HEAVEN_STONE_ID = 85
/** Stones an upgrade can use, in the order they are spent. */
export const UPGRADE_STONE_IDS = [UPGRADE_STONE_ID, HEAVEN_STONE_ID]

/** a_job_flag bit n = class n in t_skill.a_job order. */
const JOB_ORDER: ClassId[] = ['titan', 'knight', 'healer', 'mage', 'rogue', 'sorcerer']

function lcGear(item: LcItem): GearDef | undefined {
  const slot = SLOTS_BY_WEARING[item.slot]
  if ((item.type !== 0 && item.type !== 1) || !slot) return undefined
  const [n0 = 0, n1 = 0, n2 = 0] = item.stats
  const classes = JOB_ORDER.filter((_, bit) => (item.jobFlag & (1 << bit)) !== 0)
  return item.type === 0
    ? {
        slot,
        classes,
        attack: n0,
        magicAttack: n1,
        defense: 0,
        magicDefense: 0,
        attackInterval: n2 > 0 ? n2 / 10 : undefined,
      }
    : { slot, classes, attack: 0, magicAttack: 0, defense: n0, magicDefense: n1 }
}

const knightGear = (gear: Partial<GearDef> & Pick<GearDef, 'slot'>): GearDef => ({
  classes: ['knight'],
  attack: 0,
  magicAttack: 0,
  defense: 0,
  magicDefense: 0,
  ...gear,
})

/** Own placeholder items for the game without the LC data — and the tests. */
const PLACEHOLDER_ITEMS: Record<number, ItemDef> = {
  1: { id: 1, name: 'Rusty Cog', type: 'material', level: 1, price: 4 },
  2: { id: 2, name: 'Golem Core', type: 'material', level: 1, price: 40 },
  3: { id: 3, name: 'Stone Shard', type: 'material', level: 3, price: 9 },
  4: {
    id: 4,
    name: 'Sentinel Blade',
    type: 'weapon',
    level: 3,
    price: 120,
    gear: knightGear({ slot: 'weapon', attack: 14, attackInterval: 1.2 }),
  },
  5: {
    id: 5,
    name: 'Training Sword',
    type: 'weapon',
    level: 1,
    price: 0,
    gear: knightGear({ slot: 'weapon', attack: 8, attackInterval: 1.3 }),
  },
  6: {
    id: 6,
    name: 'Squire Tunic',
    type: 'armor',
    level: 1,
    price: 0,
    gear: knightGear({ slot: 'armor', defense: 10 }),
  },
  7: {
    id: 7,
    name: 'Iron Helm',
    type: 'armor',
    level: 2,
    price: 200,
    gear: knightGear({ slot: 'helmet', defense: 6 }),
  },
  [UPGRADE_STONE_ID]: {
    id: UPGRADE_STONE_ID,
    name: 'Smelting Stone',
    type: 'material',
    level: 0,
    price: 100,
  },
  [HEAVEN_STONE_ID]: {
    id: HEAVEN_STONE_ID,
    name: 'Heaven Stone',
    type: 'material',
    level: 0,
    price: 1000,
  },
}

export const ITEMS: Record<number, ItemDef> = lcData
  ? Object.fromEntries(
      lcData.items.map((i) => [
        i.id,
        {
          id: i.id,
          name: i.name,
          type: LC_TYPES[i.type] ?? 'other',
          level: i.level,
          price: i.price,
          gear: lcGear(i),
        },
      ]),
    )
  : PLACEHOLDER_ITEMS

/**
 * % of an item's price the shop pays when the player sells it — t_shop.a_sell_rate (40 in the LC data;
 * the same value is used for the placeholder items).
 */
export const SHOP_SELL_RATE = lcData?.shop?.sellRate ?? 40

/** % of an item's price the player pays in a shop — t_shop.a_buy_rate (100 in the LC data). */
export const SHOP_BUY_RATE = lcData?.shop?.buyRate ?? 100

export function getItem(id: number): ItemDef {
  return ITEMS[id] ?? { id, name: `Item #${id}`, type: 'other', level: 0, price: 0 }
}

/** Where the item's icon sits in the icon sheet, or null when there is none (yet). */
export function itemIcon(id: number): IconSprite | null {
  return iconSprite(lcIcons?.items, id)
}

const PLACEHOLDER_SHOPS: Record<string, number[]> = { glade: [7, 4, UPGRADE_STONE_ID] }
const PLACEHOLDER_STARTER: Partial<Record<ClassId, number[]>> = { knight: [5, 6] }

/** What the shops of a zone sell (LC t_shopitem of the zone's NPC shops). */
export function shopItems(zoneId: string): number[] {
  return (lcData ? lcData.shops?.[zoneId] : PLACEHOLDER_SHOPS[zoneId]) ?? []
}

/** The free level-1 set a new character of the class starts with. */
export function starterGear(classId: ClassId): number[] {
  return (lcData ? lcData.starterGear?.[classId] : PLACEHOLDER_STARTER[classId]) ?? []
}

/** Power of a piece without upgrades: attack + magic attack, or defense + magic defense. */
export function gearPower(gear: GearDef): number {
  return gear.slot === 'weapon' ? gear.attack + gear.magicAttack : gear.defense + gear.magicDefense
}

export interface GearReference {
  /** Typical weapon power at the level. */
  weapon: number
  /** Typical power of all armor pieces together. */
  armor: number
}

/** Typical gear from any item list: per slot, the median power of the newest tier the class can wear. */
function referenceFrom(items: readonly ItemDef[], classId: ClassId, level: number): GearReference {
  const tierPower = (slot: EquipSlot) => {
    const fits = items.filter(
      (i) => i.gear?.slot === slot && i.gear.classes.includes(classId) && i.level <= level,
    )
    if (fits.length === 0) return 0
    const tier = Math.max(...fits.map((i) => i.level))
    const powers = fits
      .filter((i) => i.level === tier)
      .map((i) => gearPower(i.gear!))
      .sort((a, b) => a - b)
    const mid = powers.length >> 1
    return powers.length % 2 ? powers[mid]! : (powers[mid - 1]! + powers[mid]!) / 2
  }
  return {
    weapon: tierPower('weapon'),
    armor: EQUIP_SLOTS.filter((s) => s !== 'weapon').reduce((sum, s) => sum + tierPower(s), 0),
  }
}

const placeholderList = Object.values(PLACEHOLDER_ITEMS)

/** What a character of the class typically wears at a level (LC data: computed by import-lc-db). */
export function gearReference(classId: ClassId, level: number): GearReference {
  const lc = lcData?.gearReference?.[classId]
  if (lc) {
    const i = Math.min(lc.weapon.length, Math.max(1, Math.floor(level))) - 1
    return { weapon: lc.weapon[i] ?? 0, armor: lc.armor[i] ?? 0 }
  }
  return referenceFrom(placeholderList, classId, level)
}

/** Classes in creation order that can wear an item (for labels). */
export function gearClasses(gear: GearDef): ClassId[] {
  return CLASS_ORDER.filter((c) => gear.classes.includes(c))
}

/** Slots a class can fill (in LC only knights carry shields). */
export function classSlots(classId: ClassId): EquipSlot[] {
  return EQUIP_SLOTS.filter(
    (slot) =>
      slot !== 'shield' ||
      Object.values(ITEMS).some(
        (i) => i.gear?.slot === 'shield' && i.gear.classes.includes(classId),
      ),
  )
}
