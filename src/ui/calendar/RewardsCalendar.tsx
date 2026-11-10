import { useEffect, useState } from 'react'
import {
  LOGIN_MAX_GAP_MS,
  LOGIN_ONLINE_MS,
  loginReward,
  type CalendarTrack,
} from '../../game/data/loginCalendar.ts'
import { getItem } from '../../game/data/items.ts'
import {
  calendarDates,
  calendarDay,
  calendarDayStart,
  calendarForDay,
} from '../../game/logic/loginCalendar.ts'
import { useGameStore } from '../../state/gameStore.ts'
import { ItemIcon } from '../items/ItemIcon.tsx'
import { Sheet } from '../Sheet.tsx'
import { Bar } from '../hud/Bar.tsx'
import './calendar.css'

const displayDate = (time: number, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en', { timeZone: 'UTC', ...options }).format(time)
const clock = (milliseconds: number, roundUp = true) => {
  const seconds = Math.max(0, (roundUp ? Math.ceil : Math.floor)(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function useCalendarStatus(live = false) {
  const saved = useGameStore((s) => s.save.loginCalendar)
  const markedAt = useGameStore((s) => s.calendarMarkedAt)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), live ? 1000 : 5000)
    const sync = () => setNow(Date.now())
    document.addEventListener('visibilitychange', sync)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [live])
  const day = calendarDay(now)
  const progress = calendarForDay(saved, now)
  const elapsed =
    markedAt !== null && !document.hidden && progress.day === day
      ? Math.min(LOGIN_MAX_GAP_MS, Math.max(0, now - Math.max(markedAt, calendarDayStart(now))))
      : 0
  const onlineMs = progress.day === day ? Math.min(LOGIN_ONLINE_MS, progress.onlineMs + elapsed) : 0
  const claimed = progress.claimedDays.includes(day)
  return { now, day, progress, onlineMs, claimed, ready: onlineMs >= LOGIN_ONLINE_MS && !claimed }
}

export function CalendarButton({ onClick }: { onClick(): void }) {
  const boss = useGameStore((s) => !!s.character?.worldBoss?.active || !!s.worldBossResult)
  const { ready } = useCalendarStatus()
  if (boss) return null
  return (
    <button
      type="button"
      className={`icon-button hud__menu hud__menu--calendar${ready ? ' is-ready' : ''}`}
      aria-label={ready ? 'Rewards Calendar, reward ready' : 'Rewards Calendar'}
      title="Rewards Calendar"
      onClick={onClick}
    >
      {ready && <span className="calendar-ready" aria-hidden="true" />}
    </button>
  )
}

export function RewardsCalendar({ onClose }: { onClose(): void }) {
  const { now, day, progress, onlineMs, claimed, ready } = useCalendarStatus(true)
  const [track, setTrack] = useState<CalendarTrack>('weekly')
  const [selected, setSelected] = useState(day)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dates = calendarDates(track, now)
  const chosen =
    dates.find((time) => calendarDay(time) === selected) ??
    dates.find((time) => calendarDay(time) === day)!
  const reward = loginReward(track, new Date(chosen))
  const item = getItem(reward.itemId)
  const selectedDay = calendarDay(chosen)
  const done = progress.claimedDays.includes(selectedDay)
  const status = done
    ? 'Claimed'
    : selectedDay < day
      ? 'Missed'
      : selectedDay > day
        ? 'Upcoming'
        : ready
          ? 'Ready to claim'
          : 'Today'
  const todayPrizes = [loginReward('weekly', new Date(now)), loginReward('monthly', new Date(now))]
  const claim = async () => {
    if (busy || !ready) return
    setBusy(true)
    setError('')
    try {
      await useGameStore.getState().claimLoginCalendar()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ''
      setError(
        message === 'calendar-already-claimed'
          ? 'Today’s rewards have already been claimed.'
          : message === 'calendar-online-required'
            ? 'Stay online until the ten-minute counter is full.'
            : 'The reward could not be saved. Please reload and try again.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      centered
      title="Rewards Calendar"
      titleId="calendar-title"
      className="sheet--client rewards-calendar"
      onClose={onClose}
    >
      <div className="tabs" role="tablist" aria-label="Reward calendar">
        {(['weekly', 'monthly'] as const).map((name) => (
          <button
            key={name}
            role="tab"
            id={`calendar-${name}-tab`}
            aria-selected={track === name}
            aria-controls="calendar-page"
            className={`tabs__tab${track === name ? ' is-active' : ''}`}
            onClick={() => {
              setTrack(name)
              setSelected(day)
            }}
          >
            {name === 'weekly' ? 'Weekly' : 'Monthly'}
          </button>
        ))}
      </div>
      <div className="calendar-period">
        <span className="calendar-period__icon" aria-hidden="true" />
        <div>
          <h3>
            {track === 'weekly'
              ? 'Weekly rewards'
              : displayDate(now, { month: 'long', year: 'numeric' })}
          </h3>
          <p>
            {track === 'weekly'
              ? `${displayDate(dates[0]!, { day: 'numeric', month: 'short' })} to ${displayDate(dates[6]!, { day: 'numeric', month: 'short', year: 'numeric' })}`
              : 'A gift for every day you play'}
          </p>
        </div>
      </div>
      <p className="calendar-summary">
        {claimed
          ? 'Today’s gifts have been collected.'
          : ready
            ? 'Today’s gifts are ready to collect.'
            : `Play 10 minutes today. Still needed: ${clock(LOGIN_ONLINE_MS - onlineMs)}.`}
      </p>
      <div
        id="calendar-page"
        role="tabpanel"
        aria-labelledby={`calendar-${track}-tab`}
        className="calendar-layout"
      >
        <div className="calendar-board">
          {track === 'monthly' && (
            <div className="calendar-weekdays" aria-hidden="true">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
          )}
          <div
            className={`calendar-grid calendar-grid--${track}`}
            aria-label={track === 'weekly' ? 'This week' : 'This month'}
          >
            {track === 'monthly' &&
              Array.from({ length: (new Date(dates[0]!).getUTCDay() + 6) % 7 }, (_, i) => (
                <span className="calendar-empty" key={`empty-${i}`} />
              ))}
            {dates.map((time) => {
              const key = calendarDay(time)
              const prize = loginReward(track, new Date(time))
              const prizeItem = getItem(prize.itemId)
              const taken = progress.claimedDays.includes(key)
              const past = key < day && !taken
              return (
                <button
                  type="button"
                  key={key}
                  className={`calendar-day${key === day ? ' is-today' : ''}${key === selectedDay ? ' is-selected' : ''}${taken ? ' is-claimed' : ''}${past ? ' is-missed' : ''}`}
                  aria-pressed={key === selectedDay}
                  aria-label={`${displayDate(time, { month: 'long', day: 'numeric' })}: ${prizeItem.name} x${prize.count}, ${taken ? 'claimed' : past ? 'missed' : key === day ? 'today' : 'upcoming'}`}
                  onClick={() => setSelected(key)}
                >
                  <span className="calendar-day__date">
                    {track === 'weekly'
                      ? displayDate(time, { weekday: 'short' })
                      : new Date(time).getUTCDate()}
                  </span>
                  <span className="calendar-day__icon">
                    <ItemIcon item={prizeItem} fluid />
                  </span>
                  <strong className="calendar-day__count">×{prize.count}</strong>
                  {track === 'weekly' && (
                    <span className="calendar-day__name">{prizeItem.name}</span>
                  )}
                  <span className="calendar-day__state">
                    {taken ? '✓' : key === day ? 'Today' : past ? 'Missed' : ''}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        <aside className="calendar-preview" aria-label="Selected reward">
          <p className="calendar-preview__date">
            {displayDate(chosen, { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
          <div className="calendar-preview__item">
            <ItemIcon item={item} size={46} />
            <div>
              <strong>{item.name}</strong>
              <span>×{reward.count}</span>
            </div>
          </div>
          <span className={`calendar-state${done ? ' is-claimed' : ''}`}>{status}</span>
          <p>
            {selectedDay === day
              ? 'Today’s weekly and monthly gifts are collected together.'
              : 'Select a date to preview its reward. Only today’s gifts can be claimed.'}
          </p>
        </aside>
        <section className="calendar-claim" aria-label="Today's login rewards">
          <div className="calendar-online">
            <span>{claimed ? 'Today’s rewards claimed' : 'Time online today'}</span>
            <strong>{clock(onlineMs, false)} / 10:00</strong>
          </div>
          <Bar
            variant="book"
            value={onlineMs}
            max={LOGIN_ONLINE_MS}
            label="Daily online time"
            text={`${clock(onlineMs, false)} / 10:00`}
          />
          <div className="calendar-today-prizes">
            {todayPrizes.map((prize, i) => (
              <div key={i}>
                <ItemIcon item={getItem(prize.itemId)} size={28} />
                <span>
                  <small>{i === 0 ? 'Weekly' : 'Monthly'}</small>
                  {getItem(prize.itemId).name} <strong>×{prize.count}</strong>
                </span>
              </div>
            ))}
          </div>
          <button
            className="button calendar-claim__button"
            disabled={!ready || busy}
            onClick={() => void claim()}
          >
            {busy
              ? 'Claiming…'
              : claimed
                ? 'Claimed today'
                : ready
                  ? 'Claim today’s rewards'
                  : `Available in ${clock(LOGIN_ONLINE_MS - onlineMs)}`}
          </button>
          {error && (
            <p role="alert" className="calendar-error">
              {error}
            </p>
          )}
          <p className="calendar-rules">
            One claim per account each day. Both calendars share the same claim.
            <br />
            Spend 10 minutes online in the game. Resets daily at 00:00 UTC.
          </p>
        </section>
      </div>
    </Sheet>
  )
}
