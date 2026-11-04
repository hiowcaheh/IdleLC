/** Solo level rules: Battle_DivisionExpSP.cpp and Battle_NPCDropItem.cpp. */
const EXP_PERCENT = [95, 90, 75, 60, 45, 10] as const

export function levelRewardRates(playerLevel: number, monsterLevel: number) {
  const above = Math.max(0, Math.trunc(playerLevel) - Math.trunc(monsterLevel))
  return {
    exp: above === 0 ? 100 : EXP_PERCENT[Math.min(above, 6) - 1]!,
    sp: Math.max(0, 100 - above * 10),
    drops: above <= 5,
    // Neutral runtime money rate (100%); each extra level removes five percentage points.
    goldChance: Math.max(0, 8000 - above * 500) / 10000,
  }
}
