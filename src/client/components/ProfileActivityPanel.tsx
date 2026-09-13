import { useCallback, useEffect, useMemo, useState } from 'react'

import type { ProfileActivity, ProfileActivityDay } from '../../shared/contracts'
import { api } from '../lib/api'

type CalendarView = 'year' | 'months'

export function ProfileActivityPanel({
  profileId,
  profileName,
  isOwner = false,
  onProfileLoaded,
}: {
  profileId: string
  profileName?: string
  isOwner?: boolean
  onProfileLoaded?: (activity: ProfileActivity) => void
}) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [view, setView] = useState<CalendarView>('year')
  const [activity, setActivity] = useState<ProfileActivity | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.getProfileActivity(profileId, year)
      setActivity(response.data)
      setSelectedDate(null)
      onProfileLoaded?.(response.data)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'We could not load this practice activity.')
    } finally {
      setLoading(false)
    }
  }, [onProfileLoaded, profileId, year])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (active) void load()
    })
    return () => {
      active = false
    }
  }, [load])

  const days = useMemo(
    () => new Map(activity?.days.map((day) => [day.date, day]) ?? []),
    [activity?.days],
  )
  const selectedDay = selectedDate ? days.get(selectedDate) : undefined
  const displayName = profileName ?? activity?.profile.displayName ?? 'Their'
  const owner = activity?.isOwner ?? isOwner
  const minimumYear = activity ? new Date(activity.profile.createdAt).getUTCFullYear() : 2000

  return (
    <section className="activity-panel" aria-labelledby="activity-heading">
      <div className="activity-heading">
        <div>
          <p className="eyebrow">Practice trail</p>
          <h2 id="activity-heading">
            {owner ? 'Your practice activity' : `${firstName(displayName)}’s practice activity`}
          </h2>
          <p>
            Every square is one day. Stronger colour means more meaningful practice actions.
            {activity
              ? ` Days follow ${owner ? 'your' : `${firstName(displayName)}’s`} ${activity.timeZone} timezone.`
              : ' Days follow the profile owner’s saved timezone.'}
          </p>
        </div>
        <div className="activity-controls">
          <div className="activity-view-switch" aria-label="Calendar view">
            <button type="button" aria-pressed={view === 'year'} onClick={() => setView('year')}>
              Year
            </button>
            <button
              type="button"
              aria-pressed={view === 'months'}
              onClick={() => setView('months')}
            >
              Months
            </button>
          </div>
          <div className="activity-year-control" aria-label="Activity year">
            <button
              type="button"
              aria-label="Previous year"
              disabled={year <= minimumYear}
              onClick={() => setYear((value) => value - 1)}
            >
              ←
            </button>
            <strong>{year}</strong>
            <button
              type="button"
              aria-label="Next year"
              disabled={year >= currentYear}
              onClick={() => setYear((value) => value + 1)}
            >
              →
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="activity-loading" role="status">
          Loading practice activity…
        </div>
      ) : error ? (
        <div className="activity-error" role="alert">
          <span>{error}</span>
          <button className="text-action" type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : activity ? (
        <>
          <div className="activity-totals" aria-label={`${year} practice summary`}>
            <ActivityTotal value={activity.totals.activeDays} label="active days" />
            <ActivityTotal value={activity.totals.interactionCount} label="practice actions" />
            <ActivityTotal value={activity.totals.gamesPlayed} label="games" />
            <ActivityTotal
              value={formatDuration(activity.totals.speakingDurationSeconds)}
              label="speaking"
            />
          </div>

          {view === 'year' ? (
            <YearCalendar year={year} days={days} onSelect={setSelectedDate} />
          ) : (
            <MonthCalendars year={year} days={days} onSelect={setSelectedDate} />
          )}

          <ActivityLegend />
          {selectedDay ? <ActivityDayDetails day={selectedDay} /> : null}
          {!activity.days.length ? (
            <p className="activity-empty">
              {owner
                ? 'Finish a meaningful game action and your first activity day will appear here.'
                : `${firstName(displayName)} has no practice activity in ${year}.`}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

function ActivityTotal({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function YearCalendar({
  year,
  days,
  onSelect,
}: {
  year: number
  days: Map<string, ProfileActivityDay>
  onSelect: (date: string) => void
}) {
  const weeks = yearWeeks(year)
  return (
    <div className="activity-year-scroll">
      <div className="activity-year-calendar">
        <div className="activity-month-labels" aria-hidden="true">
          {monthNames.map((month) => (
            <span key={month}>{month}</span>
          ))}
        </div>
        <div className="activity-year-body">
          <div className="activity-weekdays" aria-hidden="true">
            <span>Mon</span>
            <span>Wed</span>
            <span>Fri</span>
          </div>
          <div className="activity-weeks" role="grid" aria-label={`${year} practice activity`}>
            {weeks.map((week) => (
              <div className="activity-week" role="row" key={week[0]}>
                {week.map((date, dayIndex) => {
                  const day = days.get(date)
                  const inYear = Number(date.slice(0, 4)) === year
                  const connects = Boolean(day && dayIndex < 6 && days.has(week[dayIndex + 1]!))
                  return (
                    <ActivityCell
                      key={date}
                      date={date}
                      day={day}
                      hidden={!inYear}
                      connects={connects}
                      onSelect={onSelect}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function MonthCalendars({
  year,
  days,
  onSelect,
}: {
  year: number
  days: Map<string, ProfileActivityDay>
  onSelect: (date: string) => void
}) {
  return (
    <div className="activity-month-grid">
      {monthNames.map((month, monthIndex) => {
        const dates = monthDates(year, monthIndex)
        const activeDays = dates.filter((date) => date && days.has(date)).length
        return (
          <section className="activity-month" key={month} aria-label={`${month} ${year}`}>
            <div className="activity-month-heading">
              <h3>{month}</h3>
              <span>{activeDays} active</span>
            </div>
            <div className="activity-month-weekdays" aria-hidden="true">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => (
                <span key={`${label}:${index}`}>{label}</span>
              ))}
            </div>
            <div className="activity-month-days">
              {dates.map((date, index) =>
                date ? (
                  <ActivityCell key={date} date={date} day={days.get(date)} onSelect={onSelect} />
                ) : (
                  <span className="activity-cell activity-cell-hidden" key={`blank:${index}`} />
                ),
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function ActivityCell({
  date,
  day,
  hidden = false,
  connects = false,
  onSelect,
}: {
  date: string
  day?: ProfileActivityDay
  hidden?: boolean
  connects?: boolean
  onSelect: (date: string) => void
}) {
  if (hidden) return <span className="activity-cell activity-cell-hidden" role="gridcell" />
  const label = day
    ? `${formatDate(date)}: ${day.interactionCount} practice actions`
    : `${formatDate(date)}: no practice activity`
  return (
    <button
      className={`activity-cell activity-level-${day?.intensity ?? 0}${connects ? ' activity-connects' : ''}`}
      type="button"
      role="gridcell"
      aria-label={label}
      title={label}
      disabled={!day}
      onClick={() => onSelect(date)}
    />
  )
}

function ActivityLegend() {
  return (
    <div className="activity-legend" aria-label="Activity intensity: less to more">
      <span>Less</span>
      {[0, 1, 2, 3, 4, 5].map((level) => (
        <i className={`activity-level-${level}`} key={level} />
      ))}
      <span>More</span>
    </div>
  )
}

function ActivityDayDetails({ day }: { day: ProfileActivityDay }) {
  const details = [
    ['Games requested', day.gamesRequested],
    ['Games accepted', day.gamesAccepted],
    ['Rounds started', day.roundsStarted],
    ['Explanations sent', day.explanationsSubmitted],
    ['Guesses sent', day.guessesSubmitted],
    ['Games completed', day.gamesCompleted],
  ] as const
  return (
    <article className="activity-day-details" aria-live="polite">
      <div>
        <p className="eyebrow">{formatDate(day.date)}</p>
        <h3>{day.interactionCount} practice actions</h3>
        <p>
          {day.gamesPlayed} {day.gamesPlayed === 1 ? 'game' : 'games'} ·{' '}
          {formatDuration(day.speakingDurationSeconds)} speaking
        </p>
      </div>
      <dl>
        {details
          .filter(([, value]) => value > 0)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      {day.topics.length ? (
        <div className="activity-topics" aria-label="Topics practised">
          {day.topics.map((topic) => (
            <span key={topic}>{topic}</span>
          ))}
        </div>
      ) : null}
    </article>
  )
}

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function yearWeeks(year: number) {
  const first = new Date(Date.UTC(year, 0, 1))
  const last = new Date(Date.UTC(year, 11, 31))
  const start = addDays(first, -mondayIndex(first))
  const end = addDays(last, 6 - mondayIndex(last))
  const weeks: string[][] = []
  let cursor = start
  while (cursor <= end) {
    const week: string[] = []
    for (let day = 0; day < 7; day += 1) week.push(toDateKey(addDays(cursor, day)))
    weeks.push(week)
    cursor = addDays(cursor, 7)
  }
  return weeks
}

function monthDates(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1))
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return [
    ...Array<string | null>(mondayIndex(first)).fill(null),
    ...Array.from({ length: count }, (_, index) =>
      toDateKey(new Date(Date.UTC(year, month, index + 1))),
    ),
  ]
}

function mondayIndex(date: Date) {
  return (date.getUTCDay() + 6) % 7
}

function addDays(date: Date, amount: number) {
  return new Date(date.getTime() + amount * 86_400_000)
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

function formatDuration(seconds: number) {
  if (seconds < 60) return seconds ? `${seconds}s` : '0m'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name
}
