/** Daily login calendar: real foreground time, one shared daily claim for both tracks. */
import { LOGIN_ONLINE_MS, loginReward } from '../data/loginCalendar.ts'
import type { CharacterData } from './character.ts'
import { GameError } from './errors.ts'
import { addToInventory, type ItemStack } from './loot.ts'

export interface LoginCalendarProgress {
  /** Latest UTC date seen; never roll this back when the device clock moves backwards. */
  day: string
  onlineMs: number
  /** Bounded history, covering the displayed month and weeks crossing a month boundary. */
  claimedDays: string[]
}
export interface CalendarClaim {
  character: CharacterData
  calendar: LoginCalendarProgress
  prizes: ItemStack[]
}
export const calendarDay = (now: number): string => new Date(now).toISOString().slice(0, 10)
export const calendarDayStart = (now: number): number => Math.floor(now / 86400000) * 86400000

function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(time) && calendarDay(time) === value
}

export function sanitizeLoginCalendar(raw: unknown): LoginCalendarProgress | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const p = raw as LoginCalendarProgress
  if (!validDay(p.day)) return undefined
  return {
    day: p.day,
    onlineMs: Number.isFinite(p.onlineMs)
      ? Math.max(0, Math.min(LOGIN_ONLINE_MS, Math.floor(p.onlineMs)))
      : 0,
    claimedDays: [...new Set(Array.isArray(p.claimedDays) ? p.claimedDays.filter(validDay) : [])]
      .filter((day) => day <= p.day)
      .sort()
      .slice(-62),
  }
}

export function calendarForDay(
  progress: LoginCalendarProgress | undefined,
  now: number,
): LoginCalendarProgress {
  const day = calendarDay(now)
  if (progress && progress.day >= day) return progress
  return {
    day,
    onlineMs: 0,
    claimedDays: progress?.claimedDays.filter((d) => d >= calendarDay(now - 62 * 86400000)) ?? [],
  }
}

export function addCalendarOnline(
  progress: LoginCalendarProgress | undefined,
  milliseconds: number,
  now: number,
): LoginCalendarProgress {
  const p = calendarForDay(progress, now)
  if (p.day !== calendarDay(now) || !Number.isFinite(milliseconds) || milliseconds <= 0) return p
  return { ...p, onlineMs: Math.min(LOGIN_ONLINE_MS, p.onlineMs + Math.floor(milliseconds)) }
}

export function claimLoginCalendar(
  character: CharacterData,
  progress: LoginCalendarProgress | undefined,
  now: number,
): CalendarClaim {
  const p = calendarForDay(progress, now)
  if (p.day !== calendarDay(now)) throw new GameError('calendar-clock-behind')
  if (p.claimedDays.includes(p.day)) throw new GameError('calendar-already-claimed')
  if (p.onlineMs < LOGIN_ONLINE_MS) throw new GameError('calendar-online-required')
  const date = new Date(now)
  const prizes = [loginReward('weekly', date), loginReward('monthly', date)]
  return {
    character: { ...character, inventory: addToInventory(character.inventory, prizes) },
    calendar: { ...p, claimedDays: [...p.claimedDays, p.day].slice(-62) },
    prizes,
  }
}

/** Dates in the current Monday-based week, or the current month. */
export function calendarDates(track: 'weekly' | 'monthly', now: number): number[] {
  const date = new Date(now)
  const start =
    track === 'weekly'
      ? calendarDayStart(now) - ((date.getUTCDay() + 6) % 7) * 86400000
      : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  const count =
    track === 'weekly'
      ? 7
      : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  return Array.from({ length: count }, (_, i) => start + i * 86400000)
}
