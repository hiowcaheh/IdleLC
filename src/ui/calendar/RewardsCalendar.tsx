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
  const [preview, setPreview] = useState<{ date: number; track: CalendarTrack } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dates = calendarDates(track, now)
  // the month as whole weeks from Monday, the empty fields drawn like the client's 6×7 grid
  const lead = (new Date(dates[0]!).getUTCDay() + 6) % 7
  const weeks = Math.ceil((lead + dates.length) / 7)
  const selectedDay = preview ? calendarDay(preview.date) : day
  const isToday = selectedDay === day
  const done = progress.claimedDays.includes(selectedDay)
  const prizes = isToday
    ? [loginReward('weekly', new Date(now)), loginReward('monthly', new Date(now))]
    : [loginReward(preview?.track ?? track, new Date(preview?.date ?? now))]
  const status = done
    ? 'Claimed'
    : selectedDay < day
      ? 'Missed'
      : selectedDay > day
        ? 'Upcoming'
        : ready
          ? 'Ready to claim'
          : 'Today'
  const openReward = (date: number) => {
    setError('')
    setPreview({ date, track })
  }
  const closeReward = () => {
    if (!busy) setPreview(null)
  }
  const claim = async () => {
    if (busy || !ready || !isToday) return
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
    <>
      <Sheet
        centered
        title="Rewards Calendar"
        titleId="calendar-title"
        className={`sheet--client rewards-calendar rewards-calendar--${track}`}
        onClose={onClose}
      >
        <div className="calendar-progress">
          <Bar
            variant="book"
            value={onlineMs}
            max={LOGIN_ONLINE_MS}
            label="Daily online time"
            text={`Online today ${clock(onlineMs, false)} / 10:00`}
          />
        </div>
        <div className="tabs" role="tablist" aria-label="Reward calendar">
          {(['weekly', 'monthly'] as const).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              id={`calendar-${name}-tab`}
              aria-selected={track === name}
              aria-controls="calendar-page"
              className={`tabs__tab${track === name ? ' is-active' : ''}`}
              onClick={() => setTrack(name)}
            >
              {name === 'weekly' ? 'Weekly' : 'Monthly'}
            </button>
          ))}
        </div>
        <div className="calendar-period">
          <h3>
            {track === 'weekly'
              ? `${displayDate(dates[0]!, { day: 'numeric', month: 'short' })} to ${displayDate(dates[6]!, { day: 'numeric', month: 'short', year: 'numeric' })}`
              : displayDate(now, { month: 'long', year: 'numeric' })}
          </h3>
        </div>
        <div
          id="calendar-page"
          role="tabpanel"
          aria-labelledby={`calendar-${track}-tab`}
          className="calendar-board"
        >
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
            style={
              track === 'monthly'
                ? { gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }
                : undefined
            }
          >
            {track === 'monthly' &&
              Array.from({ length: lead }, (_, i) => (
                <span className="calendar-empty" key={`lead-${i}`} />
              ))}
            {dates.map((time) => {
              const key = calendarDay(time)
              const prize = loginReward(track, new Date(time))
              const item = getItem(prize.itemId)
              const taken = progress.claimedDays.includes(key)
              const past = key < day && !taken
              const today = key === day
              const sunday = new Date(time).getUTCDay() === 0
              return (
                <button
                  type="button"
                  key={key}
                  className={`calendar-day${sunday ? ' calendar-day--sunday' : ''}${today ? ' is-today' : ''}${taken ? ' is-claimed' : ''}${past ? ' is-missed' : ''}`}
                  aria-label={`${displayDate(time, { month: 'long', day: 'numeric' })}: ${item.name} x${prize.count}, ${taken ? 'claimed' : past ? 'missed' : today ? 'today' : 'upcoming'}`}
                  aria-haspopup="dialog"
                  onClick={() => openReward(time)}
                >
                  <span className="calendar-day__date">
                    {track === 'weekly' && <small>{displayDate(time, { weekday: 'short' })}</small>}
                    <span className="calendar-day__number">
                      {new Date(time).getUTCDate()}
                      {/* calendar.xml img_today: the red pen circle round today's number */}
                      {today && <i className="calendar-day__today" aria-hidden="true" />}
                    </span>
                  </span>
                  {/* calendar.xml img_plus: the client's mark of a day with an event */}
                  {sunday && <i className="calendar-day__plus" aria-hidden="true" />}
                  <span className="calendar-day__slot">
                    <ItemIcon item={item} fluid />
                    <strong className="calendar-day__count">×{prize.count}</strong>
                    {taken && (
                      <span className="calendar-day__check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </span>
                  {track === 'weekly' && <span className="calendar-day__name">{item.name}</span>}
                  {track === 'weekly' && sunday && (
                    <span className="calendar-day__finale">Weekly grand reward</span>
                  )}
                </button>
              )
            })}
            {track === 'monthly' &&
              Array.from({ length: weeks * 7 - lead - dates.length }, (_, i) => (
                <span className="calendar-empty" key={`tail-${i}`} />
              ))}
          </div>
        </div>
        <div className="calendar-footer">
          <button
            type="button"
            className={`button calendar-open-gifts${ready ? ' is-ready' : ''}`}
            aria-haspopup="dialog"
            onClick={() => openReward(calendarDayStart(now))}
          >
            {claimed ? 'View today’s gifts' : ready ? 'Collect today’s gifts' : 'Today’s gifts'}
          </button>
          <p>
            {claimed ? 'Claimed today' : 'One daily claim'} <span>Reset 00:00 UTC</span>
          </p>
        </div>
      </Sheet>
      {preview && (
        <Sheet
          centered
          title={isToday ? 'Today’s login rewards' : 'Reward preview'}
          titleId="calendar-reward-title"
          className="sheet--client calendar-reward"
          onClose={closeReward}
        >
          <p className="calendar-reward__date">
            {displayDate(preview.date, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <div className="calendar-gifts">
            {prizes.map((prize, i) => (
              <div className="calendar-gift" key={i}>
                <ItemIcon item={getItem(prize.itemId)} size={36} />
                <div>
                  <small>
                    {isToday
                      ? i === 0
                        ? 'Weekly'
                        : 'Monthly'
                      : preview.track === 'weekly'
                        ? 'Weekly'
                        : 'Monthly'}
                  </small>
                  <strong>{getItem(prize.itemId).name}</strong>
                  <span>×{prize.count}</span>
                </div>
              </div>
            ))}
          </div>
          <p className={`calendar-reward__status${done ? ' is-claimed' : ''}`}>
            {isToday
              ? claimed
                ? 'Both gifts have been collected today.'
                : 'One claim collects both gifts for your account.'
              : status}
          </p>
          {error && (
            <p role="alert" className="calendar-error">
              {error}
            </p>
          )}
          <div className="calendar-reward__actions">
            {isToday && (
              <button
                type="button"
                className="button calendar-reward__claim"
                disabled={!ready || busy}
                onClick={() => void claim()}
              >
                {busy
                  ? 'Claiming…'
                  : claimed
                    ? 'Claimed'
                    : ready
                      ? 'Claim'
                      : `Wait ${clock(LOGIN_ONLINE_MS - onlineMs)}`}
              </button>
            )}
            <button
              type="button"
              className="button calendar-reward__claim"
              disabled={busy}
              onClick={closeReward}
            >
              Return
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}
