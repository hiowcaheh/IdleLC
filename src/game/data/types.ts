/** The separate physical/magic fields displayed by the source character window. */
export interface ClientCombatStats {
  physicalAttack: number
  magicAttack: number
  physicalDefense: number
  magicDefense: number
  physicalHit: number
  magicHit: number
  physicalEvasion: number
  magicEvasion: number
  criticalRating: number
  deadlyRating: number
  runSpeed: number
  walkSpeed: number
}

/** Calculation context for the source sheet; neither this nor the sheet is persisted in saves. */
export interface ClientStatContext {
  classId: ClassId
  level: number
  physicalAttribute: 'strength' | 'dexterity'
  physicalChannel: 'melee' | 'ranged'
  magicWeapon: boolean
  criticalOptionRate: number
  deadlyOptionRate: number
  criticalGroups?: readonly { flat: number; rate: number }[]
  deadlyGroups?: readonly { flat: number; rate: number }[]
}

/** Stats that drive auto-combat. Shared by player classes and monsters. */
export interface CombatStats {
  client?: ClientCombatStats
  clientContext?: ClientStatContext
  /** Independent channels are also retained for NPCs, which have no character sheet context. */
  magicAttack?: number
  physicalAttack?: number
  physicalHit?: number
  magicDefense?: number
  magicHit?: number
  magicEvasion?: number
  attackType?: 'melee' | 'ranged' | 'magic'
  strongBonus?: number
  hardBonus?: number
  /** Passive then assist recovery groups; options apply last (PC.cpp:2408). */
  recoveryGroups?: readonly { hpFlat: number; hpRate: number; mpFlat: number; mpRate: number }[]
  recoveryOptions?: { hpFlat: number; hpRate: number; mpRate: number }
  maxHp: number
  attack: number
  defense: number
  /** Seconds between the start of two consecutive attacks. */
  attackInterval: number
  /** Probability (0..1) that a landed hit is critical. */
  critChance: number
  /** Damage multiplier applied to critical hits. */
  critMultiplier: number
  /** Mana for skills (monsters have none). */
  maxMp?: number
  /** Flat HP/MP recovery contribution per three-second natural recovery pulse. */
  hpRegen?: number
  mpRegen?: number
  /** Raw hit and avoidance ratings at equal levels. */
  hit?: number
  dodge?: number
  /** Avoidance adjustment per level of advantage: PC 10, NPC 1. */
  avoidPerLevel?: number
  strength?: number
  dexterity?: number
  intelligence?: number
  constitution?: number
  /** Seconds added to every skill's cast time (negative = faster casting). */
  castTime?: number
  /** Percent reduction of skill ready time (STAT23). */
  castSpeed?: number
  /** Seconds added to skill reuse time (STAT8), separate from ready time. */
  reuseTime?: number
  /** Percent chance to halve a normal attack; skills bypass this option. */
  stunResistance?: number
  stoneResistance?: number
  silenceResistance?: number
  blockChance?: number
  /** % shorter skill cooldowns and % less mana for skills (rare options). */
  cooldownReduction?: number
  mpCostReduction?: number
  /** % of the damage dealt that comes back as HP / MP (rare options). */
  hpSteal?: number
  mpSteal?: number
  /** % faster running to the monster (rare options). */
  moveSpeed?: number
}

export type ClassId = 'titan' | 'knight' | 'healer' | 'mage' | 'rogue' | 'sorcerer'

export interface ClassDef {
  id: ClassId
  name: string
  /** Weapon and fighting style in a few words (character creation). */
  role: string
  description: string
  modelId: string
  /** Stats at level 1. */
  base: CombatStats
  /** Flat increase per level above 1 (only growing stats). */
  perLevel: Pick<CombatStats, 'maxHp' | 'attack' | 'defense'>
  /** Mana at level 1 and its increase per level. */
  mana: { base: number; perLevel: number }
}

export interface ZoneDef {
  id: string
  name: string
  minLevel: number
  /** The hunting spots in order, lowest level first (event monsters and raid bosses left out). */
  monsterIds: string[]
  /** Raid bosses of the zone, kept for a boss system to come (not hunting spots). */
  bossIds: string[]
  /** The client's terrain drawn around the fights (public/maps/<map>/), when converted. */
  map?: string
  environment: {
    skyTop: string
    skyBottom: string
    fog: string
    groundLow: string
    groundHigh: string
  }
}

export interface MonsterDef {
  id: string
  name: string
  zoneId: string
  level: number
  stats: CombatStats
  exp: number
  gold: number
  modelId: string
  /** Extra model scale on top of the manifest scale (LC: t_npc.a_scale). */
  scale?: number
  elite?: boolean
  /** Loot table: each entry is rolled separately on every kill. */
  drops?: MonsterDrop[]
  /** Source fixed-width table, including empty slots; absent in older imports. */
  dropSlots?: (MonsterDrop | null)[]
  /** Skill points for a kill, in 1/10 000 SP (LC t_npc.a_skill_point). */
  sp?: number
}

export interface MonsterDrop {
  itemId: number
  /** Probability 0..1 per kill (LC: a_item_percent / 10000). */
  chance: number
}

export type ItemType = 'weapon' | 'armor' | 'scroll' | 'material' | 'accessory' | 'potion' | 'other'

export type ArmorSlot = 'helmet' | 'armor' | 'pants' | 'shield' | 'gloves' | 'boots'
export type AccessorySlot = 'accessory1' | 'accessory2' | 'accessory3'
/** Equipment slots: LC t_item.a_wearing 0…6 and the three accessory places (a_wearing 7). */
export type EquipSlot = 'weapon' | ArmorSlot | AccessorySlot
/** Where a piece goes: one slot, or any accessory slot. */
export type GearSlot = 'weapon' | ArmorSlot | 'accessory'

/** What a weapon, armor piece or accessory gives, 1:1 from t_item.a_num_0…2. */
export interface GearDef {
  slot: GearSlot
  /** t_item.a_subtype_idx: weapon kind, armor part or accessory kind (option masks use it). */
  subtype: number
  /** Classes that can wear it (a_job_flag). */
  classes: ClassId[]
  attack: number
  magicAttack: number
  defense: number
  magicDefense: number
  /** Weapons: seconds between attacks (a_num_2 in 1/10 s). */
  attackInterval?: number
}

/**
 * A potion — in LC a skill (t_item.a_num_0 → t_skill): HP or MP per second while it lasts, or faster
 * recovery (per 5 s tick).
 */
export interface PotionDef {
  kind: 'hp' | 'mp' | 'hpRegen' | 'mpRegen'
  power: number
  /** Seconds the effect lasts. */
  duration: number
  /** Seconds before the next potion of the kind (t_skill.a_reuseTime). */
  cooldown: number
}

/** An item option 1:1 from t_option. */
export interface OptionDef {
  type: number
  name: string
  /** Value at each option level (index 0 = level 1). */
  values: number[]
  /** Roll weight of each level; 0 = never rolls. */
  weights: number[]
  /** Bits of the weapon / armor / accessory subtypes the option can appear on. */
  weaponMask: number
  armorMask: number
  accessoryMask: number
}

/**
 * A rare option set 1:1 from t_rareoption: what an identified rare item gets — a grade, a name
 * prefix, flat bonuses and options, each with its chance (1/10 000).
 */
export interface RareSetDef {
  id: number
  /** 0 = A (the best) … 4 = E. */
  grade: number
  /** 0 weapon, 1 armor, 2 accessory. */
  type: number
  prefix: string
  attack: number
  defense: number
  magic: number
  resist: number
  options: { type: number; level: number; chance: number }[]
}

export interface ItemDef {
  id: number
  name: string
  type: ItemType
  /** Required level. */
  level: number
  /** Shop price in gold. */
  price: number
  /** Weapons, armor and accessories. */
  gear?: GearDef
  /** Can be upgraded with stones (t_item.a_flag bit 2). */
  upgradeable?: boolean
  potion?: PotionDef
  /** Rare items: the option sets an identification can give (t_item.a_rare_index / a_rare_prob). */
  rare?: { set: number; weight: number }[]
  /** Magnifying glasses: chance that an identification works. */
  magnifier?: { chance: number }
  /** Title items (type Other): the title using it adds (data/titles.ts). */
  title?: number
}

/** A title 1:1 from t_title, shown under the hero's name while worn. */
export interface TitleDef {
  id: number
  /** The item (type Other) that gives the title. */
  item: number
  name: string
  description: string
  /** Days it lasts once added; null = permanent. */
  days: number | null
  /** Text colour and outline colour (#rrggbb, t_title a_color / a_bgcolor). */
  color: string
  outline: string
  /** t_option options it gives while worn. */
  options: { type: number; level: number }[]
  /**
   * The client's effect for the title (t_title a_effect_name, e.g. `eff_nameSKY`); its look is in
   * the encrypted Effect.dat, so the game draws its own (ui/titles/format.ts titleEffectColor).
   */
  effect?: string
}

/** One effect of a skill level: t_magic (type, subtype, damage type) + t_magiclevel.a_power. */
export interface SkillEffectDef {
  magic?: number
  magicLevel?: number
  /** Separate source hit probability (1/10000), never inferred from power. */
  hitrate?: number
  hitType?: number
  type: number
  subtype: number
  /** Source MDT: 0 ONLYPOWER, 1 ADDITION, 2 RATE. */
  damageType: number
  power: number
}

export interface SkillLevelDef {
  level: number
  mp: number
  hp: number
  /** Effect duration in 1/10 s. */
  duration: number
  /** Character level needed to learn this skill level. */
  learnLevel: number
  /** Skill points needed (whole SP). */
  learnSp: number
  requires: { skill: number; level: number }[]
  effects: SkillEffectDef[]
}

/** A class skill, 1:1 from t_skill + t_skilllevel. Interpreted by src/game/logic/skills.ts. */
export interface SkillDef {
  id: number
  classId: ClassId
  name: string
  description: string
  /** t_skill.a_type: 0 melee, 1 ranged, 2 magic, 3 passive. */
  type: number
  targetType: number
  /** Timings in 1/10 s. */
  readyTime: number
  fireTime: number
  reuseTime: number
  /** Source flags; undefined means the old export did not preserve them. */
  flag?: number
  applyState?: number
  /** What the hero must wear to use it (t_skill.a_useWeaponType0/1, a_useState). */
  needs?: SkillNeeds
  /** Passives: what the hero must wear for them to work (a_appWeaponType0/1, a_appState). */
  passiveNeeds?: SkillNeeds
  levels: SkillLevelDef[]
}

/** Gear a skill needs, 1:1 from t_skill. */
export interface SkillNeeds {
  /** Weapon kinds it works with (t_item.a_subtype_idx); empty = any. */
  weapons: number[]
  /** A weapon must be worn. */
  weapon: boolean
  /** A shield must be worn. */
  shield: boolean
}
