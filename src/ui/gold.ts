/** UIManager::GetNasColor: the original client's gold amount thresholds. */
export function goldColor(amount: number): string {
  if (amount < 1_000) return '#ffffff'
  if (amount < 1_000_000) return '#00ffff'
  if (amount < 1_000_000_000) return '#00ff00'
  if (amount < 1_000_000_000_000) return '#ffff00'
  return '#ffcc00'
}
