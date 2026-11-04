/** UIManager.cpp:2321–2325 / UITargetInfo.cpp:39–43,465–469: original LC name bands. */
export function levelTone(playerLevel: number, targetLevel: number): string {
  const diff = targetLevel - playerLevel
  if (diff >= 6) return 'deadly'
  if (diff >= 3) return 'hard'
  if (diff >= -2) return 'even'
  if (diff >= -5) return 'easy'
  return 'trivial'
}
