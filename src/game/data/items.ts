import { CLASS_ORDER } from './classes.ts'
import { iconSprite, type IconSprite } from './icons.ts'
import { lcData, lcIcons } from './lcSource.ts'
import type { LcItem } from './lcTypes.ts'
import type {
  AccessorySlot,
  ArmorSlot,
  ClassId,
  EquipSlot,
  GearDef,
  GearSlot,
  ItemDef,
  ItemType,
  OptionDef,
  RareSetDef,
} from './types.ts'

/** t_item.a_type_idx → item type (see docs/lc-database.md). */
const LC_TYPES: Record<number, ItemType> = {
  0: 'weapon',
  1: 'armor',
  2: 'scroll',
  4: 'material',
  5: 'accessory',
  6: 'potion',
}

/** t_item.a_wearing → slot (7 = any of the three accessory places). */
export const SLOTS_BY_WEARING: GearSlot[] = [
  'helmet',
  'armor',
  'weapon',
  'pants',
  'shield',
  'gloves',
  'boots',
  'accessory',
]

export const ARMOR_SLOTS: ArmorSlot[] = ['shield', 'helmet', 'armor', 'pants', 'gloves', 'boots']
export const ACCESSORY_SLOTS: AccessorySlot[] = ['accessory1', 'accessory2', 'accessory3']

/** Display order of the slots. */
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', ...ARMOR_SLOTS, ...ACCESSORY_SLOTS]

/** The slots a piece can go to. */
export function slotsFor(gear: Pick<GearDef, 'slot'>): EquipSlot[] {
  return gear.slot === 'accessory' ? ACCESSORY_SLOTS : [gear.slot]
}

/**
 * t_item 84 "Smelting Stone": drops from monsters (logic/loot.ts); 10 are exchanged for a Heaven Stone
 * (owner's rule, logic/equipment.ts).
 */
export const SMELTING_STONE_ID = 84
/** t_item 85 "Heaven Stone": the only stone that upgrades weapons and armor; the Juno shop sells it. */
export const HEAVEN_STONE_ID = 85

/** t_item 1838 "Magnifying glass" and 1839 "Golden magnifying glass": identify rare items. */
export const MAGNIFIER_ID = 1838
export const GOLDEN_MAGNIFIER_ID = 1839
/**
 * Chance that an identification works: the golden glass always (t_item description), the plain one
 * "not guaranteed" — 60% is our own value, its price (600 000 vs 1 000 000) per success.
 */
const MAGNIFIER_CHANCE: Record<number, number> = { [MAGNIFIER_ID]: 0.6, [GOLDEN_MAGNIFIER_ID]: 1 }

/** a_job_flag bit n = class n in t_skill.a_job order. */
const JOB_ORDER: ClassId[] = ['titan', 'knight', 'healer', 'mage', 'rogue', 'sorcerer']
/** t_item.a_flag bit 2: the item can be upgraded. */
const FLAG_UPGRADE = 1 << 2
/** Accessory subtypes IdleLC wears: cords, stones, eyes, earrings, rings (pets and others not). */
const MAX_ACCESSORY_SUBTYPE = 4

function lcGear(item: LcItem): GearDef | undefined {
  const slot = SLOTS_BY_WEARING[item.slot]
  if (!slot) return undefined
  const classes = JOB_ORDER.filter((_, bit) => (item.jobFlag & (1 << bit)) !== 0)
  const base = {
    subtype: item.subtype,
    classes,
    attack: 0,
    magicAttack: 0,
    defense: 0,
    magicDefense: 0,
  }
  const [n0 = 0, n1 = 0, n2 = 0] = item.stats
  if (item.type === 0 && slot === 'weapon') {
    return {
      ...base,
      slot,
      attack: n0,
      magicAttack: n1,
      attackInterval: n2 > 0 ? n2 / 10 : undefined,
    }
  }
  if (item.type === 1 && slot !== 'weapon' && slot !== 'accessory') {
    return { ...base, slot, defense: n0, magicDefense: n1 }
  }
  if (item.type === 5 && slot === 'accessory' && item.subtype <= MAX_ACCESSORY_SUBTYPE) {
    return { ...base, slot }
  }
  return undefined
}

const knightGear = (gear: Partial<GearDef> & Pick<GearDef, 'slot'>): GearDef => ({
  subtype: 0,
  classes: ['knight'],
  attack: 0,
  magicAttack: 0,
  defense: 0,
  magicDefense: 0,
  ...gear,
})

const accessory = (subtype: number): GearDef => ({
  slot: 'accessory',
  subtype,
  classes: [...JOB_ORDER],
  attack: 0,
  magicAttack: 0,
  defense: 0,
  magicDefense: 0,
})

/** Own placeholder items for the game without the LC data — and the tests (LC ids where they exist). */
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
    upgradeable: true,
    gear: knightGear({ slot: 'weapon', attack: 14, attackInterval: 1.2 }),
  },
  5: {
    id: 5,
    name: 'Training Sword',
    type: 'weapon',
    level: 1,
    price: 0,
    upgradeable: true,
    gear: knightGear({ slot: 'weapon', attack: 8, attackInterval: 1.3 }),
  },
  6: {
    id: 6,
    name: 'Squire Tunic',
    type: 'armor',
    level: 1,
    price: 0,
    upgradeable: true,
    gear: knightGear({ slot: 'armor', subtype: 1, defense: 10 }),
  },
  7: {
    id: 7,
    name: 'Iron Helm',
    type: 'armor',
    level: 2,
    price: 200,
    upgradeable: true,
    gear: knightGear({ slot: 'helmet', defense: 6 }),
  },
  43: {
    id: 43,
    name: 'Small Healing Potion',
    type: 'potion',
    level: 0,
    price: 440,
    potion: { kind: 'hp', power: 16, duration: 15, cooldown: 5 },
  },
  44: {
    id: 44,
    name: 'Medium Healing Potion',
    type: 'potion',
    level: 0,
    price: 3420,
    potion: { kind: 'hp', power: 33, duration: 15, cooldown: 5 },
  },
  484: {
    id: 484,
    name: 'Small Mana Potion',
    type: 'potion',
    level: 0,
    price: 330,
    potion: { kind: 'mp', power: 8, duration: 15, cooldown: 5 },
  },
  490: {
    id: 490,
    name: 'Small HP Recovery Potion',
    type: 'potion',
    level: 0,
    price: 240,
    potion: { kind: 'hpRegen', power: 2, duration: 600, cooldown: 5 },
  },
  166: {
    id: 166,
    name: 'Magical Ring',
    type: 'accessory',
    level: 0,
    price: 2000,
    gear: accessory(4),
  },
  172: {
    id: 172,
    name: 'Blue Stone',
    type: 'accessory',
    level: 0,
    price: 1300,
    gear: accessory(1),
  },
  [SMELTING_STONE_ID]: {
    id: SMELTING_STONE_ID,
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
  1845: {
    id: 1845,
    name: 'Perion Sword',
    type: 'weapon',
    level: 73,
    price: 1044040,
    upgradeable: true,
    gear: knightGear({ slot: 'weapon', attack: 280, attackInterval: 1 }),
    rare: [
      { set: 1, weight: 6000 },
      { set: 7, weight: 3000 },
      { set: 23, weight: 1000 },
    ],
  },
  [MAGNIFIER_ID]: {
    id: MAGNIFIER_ID,
    name: 'Magnifying glass',
    type: 'scroll',
    level: 0,
    price: 600000,
    magnifier: { chance: MAGNIFIER_CHANCE[MAGNIFIER_ID]! },
  },
  [GOLDEN_MAGNIFIER_ID]: {
    id: GOLDEN_MAGNIFIER_ID,
    name: 'Golden magnifying glass',
    type: 'scroll',
    level: 0,
    price: 1000000,
    magnifier: { chance: MAGNIFIER_CHANCE[GOLDEN_MAGNIFIER_ID]! },
  },
}

export const ITEMS: Record<number, ItemDef> = lcData
  ? Object.fromEntries(
      lcData.items.map((i) => {
        const gear = lcGear(i)
        return [
          i.id,
          {
            id: i.id,
            name: i.name,
            type: LC_TYPES[i.type] ?? 'other',
            level: i.level,
            price: i.price,
            gear,
            upgradeable:
              gear !== undefined &&
              gear.slot !== 'accessory' &&
              ((i.flag ?? 0) & FLAG_UPGRADE) !== 0,
            potion: i.potion,
            ...(gear && i.rare?.length
              ? { rare: i.rare.map(([set, weight]) => ({ set, weight })) }
              : {}),
            ...(MAGNIFIER_CHANCE[i.id] !== undefined
              ? { magnifier: { chance: MAGNIFIER_CHANCE[i.id]! } }
              : {}),
          },
        ]
      }),
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

const PLACEHOLDER_SHOPS: Record<string, number[]> = {
  glade: [7, 4, HEAVEN_STONE_ID, 43, 44, 484, 490],
}
const PLACEHOLDER_STARTER: Partial<Record<ClassId, number[]>> = { knight: [5, 6] }
const PLACEHOLDER_SHOP_GEAR: Partial<Record<ClassId, Partial<Record<GearSlot, ShopTier[]>>>> = {
  knight: { weapon: [{ level: 3, items: [4] }], helmet: [{ level: 2, items: [7] }] },
}
const PLACEHOLDER_ACCESSORIES = [172, 166]

/** What the shops of a zone sell (LC t_shopitem of the zone's NPC shops). */
export function shopItems(zoneId: string): number[] {
  return (lcData ? lcData.shops?.[zoneId] : PLACEHOLDER_SHOPS[zoneId]) ?? []
}

export interface ShopTier {
  /** Required level of the tier's pieces. */
  level: number
  items: number[]
}

/** The weapon and armor tiers the shop sells a class, by slot (see import-db buildShopGear). */
export function shopGear(classId: ClassId): Partial<Record<GearSlot, ShopTier[]>> {
  if (!lcData) return PLACEHOLDER_SHOP_GEAR[classId] ?? {}
  const byWearing = lcData.shopGear?.[classId] ?? {}
  return Object.fromEntries(
    Object.entries(byWearing).map(([wearing, tiers]) => [SLOTS_BY_WEARING[Number(wearing)], tiers]),
  )
}

/** Magnifying glasses the shop sells in every zone (own decision; LC sells them in towns). */
export function shopMagnifiers(): number[] {
  return [MAGNIFIER_ID, GOLDEN_MAGNIFIER_ID].filter((id) => ITEMS[id])
}

/** Plain accessories the shop sells (options are rolled when one is bought). */
export function shopAccessories(): number[] {
  return lcData ? (lcData.accessories ?? []) : PLACEHOLDER_ACCESSORIES
}

/** The free level-1 set a new character of the class starts with. */
export function starterGear(classId: ClassId): number[] {
  return (lcData ? lcData.starterGear?.[classId] : PLACEHOLDER_STARTER[classId]) ?? []
}

/** Own placeholder rare sets for the game without the LC data — and the tests (LC t_rareoption). */
const PLACEHOLDER_RARE_SETS: RareSetDef[] = [
  {
    id: 1,
    grade: 4,
    type: 0,
    prefix: 'Mighty',
    attack: 0,
    defense: 0,
    magic: 0,
    resist: 0,
    options: [
      { type: 20, level: 3, chance: 10000 },
      { type: 21, level: 3, chance: 7000 },
    ],
  },
  {
    id: 7,
    grade: 3,
    type: 0,
    prefix: 'Razing',
    attack: 15,
    defense: 0,
    magic: 0,
    resist: 0,
    options: [
      { type: 20, level: 3, chance: 10000 },
      { type: 21, level: 3, chance: 4000 },
    ],
  },
  {
    id: 23,
    grade: 2,
    type: 0,
    prefix: 'Destructive',
    attack: 30,
    defense: 0,
    magic: 0,
    resist: 0,
    options: [
      { type: 20, level: 4, chance: 10000 },
      { type: 21, level: 4, chance: 6000 },
    ],
  },
]

/** Rare option sets (t_rareoption) by id. */
export const RARE_SETS: Record<number, RareSetDef> = Object.fromEntries(
  (lcData ? (lcData.rareSets ?? []) : PLACEHOLDER_RARE_SETS).map((r) => [r.id, r]),
)

export function getRareSet(id: number): RareSetDef | undefined {
  return RARE_SETS[id]
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
  const tierPower = (slot: GearSlot) => {
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
    armor: ARMOR_SLOTS.reduce((sum, s) => sum + tierPower(s), 0),
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

/** Own placeholder options for the game without the LC data — and the tests (LC t_option values). */
const PLACEHOLDER_OPTIONS: OptionDef[] = [
  {
    type: 0,
    name: 'Strength',
    values: [4, 6, 8, 12, 16],
    weights: [0, 40, 20, 5, 1],
    weaponMask: 0,
    armorMask: 8,
    accessoryMask: 42,
  },
  {
    type: 11,
    name: 'Physical Defense',
    values: [1, 2, 3, 4, 6],
    weights: [0, 80, 40, 10, 2],
    weaponMask: 0,
    armorMask: 70,
    accessoryMask: 42,
  },
  {
    type: 20,
    name: 'Attack',
    values: [1, 2, 3, 4, 5],
    weights: [0, 80, 40, 10, 2],
    weaponMask: 30975,
    armorMask: 103,
    accessoryMask: 21,
  },
  {
    type: 21,
    name: 'Hit Rate',
    values: [18, 37, 56, 75, 93],
    weights: [0, 80, 40, 10, 2],
    weaponMask: 30975,
    armorMask: 0,
    accessoryMask: 21,
  },
  {
    type: 49,
    name: 'Reduced Level Requirement',
    values: [1, 2, 3, 4, 5],
    weights: [0, 0, 0, 0, 0],
    weaponMask: 0,
    armorMask: 0,
    accessoryMask: 0,
  },
  {
    type: 58,
    name: 'Skill Cool Down Reduction',
    values: [20, 30, 40, 50, 60],
    weights: [0, 0, 0, 0, 0],
    weaponMask: 0,
    armorMask: 0,
    accessoryMask: 0,
  },
  {
    type: 64,
    name: 'Move Speed',
    values: [10, 20, 30],
    weights: [0, 0, 0],
    weaponMask: 0,
    armorMask: 0,
    accessoryMask: 0,
  },
]

/** Item options (t_option) by type. */
export const OPTIONS: Record<number, OptionDef> = Object.fromEntries(
  (lcData?.options ?? PLACEHOLDER_OPTIONS).map((o) => [o.type, o]),
)

export function getOption(type: number): OptionDef | undefined {
  return OPTIONS[type]
}
