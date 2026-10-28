/** Classic MMO "con" colors: how dangerous a target is compared to the player. */
export function levelTone(playerLevel: number, targetLevel: number): string {
  const diff = targetLevel - playerLevel
  if (diff >= 5) return 'deadly'
  if (diff >= 3) return 'hard'
  if (diff >= -2) return 'even'
  if (diff >= -6) return 'easy'
  return 'trivial'
}
