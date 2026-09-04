'use client'

import { useEffect, useState } from 'react'
import { colors, statusColors } from '@/lib/design-tokens'

/**
 * The vendor's next-14-days strip (v2 of the week-at-a-glance, owner
 * 2026-09-03). Date-based — unlike the public profile's day-of-week grid, a
 * park day skipped for an event or a market day the manager cancelled renders
 * STRUCK with the reason, and paid park days / events appear on their real
 * dates. Data: GET /api/vendor/week-schedule (lib/vendor/week-strip.ts).
 *
 * `start` is sent from the browser so "today" is the vendor's local date —
 * the server never guesses a timezone.
 */

interface StripEntry {
  marketId: string
  name: string
  kind: 'schedule' | 'park_booking' | 'booth' | 'private_pickup' | 'event'
  marketType: string
  startTime: string | null
  endTime: string | null
  status: 'on' | 'skipped_for_event' | 'cancelled_by_market'
  note: string | null
}

interface StripDay {
  date: string
  entries: StripEntry[]
}

const KIND_LABEL: Record<StripEntry['kind'], string> = {
  schedule: '',
  park_booking: 'booked',
  booth: 'booth',
  private_pickup: 'pickup',
  event: 'event',
}

function fmtTime(t: string): string {
  const [h, m] = t.split(':')
  const hour = parseInt(h!)
  const ampm = hour >= 12 ? 'p' : 'a'
  const display = hour % 12 || 12
  return m === '00' ? `${display}${ampm}` : `${display}:${m}${ampm}`
}

function dayLabel(date: string, todayIso: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d!)
  const label = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return date === todayIso ? `Today · ${label}` : label
}

function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function WeekAtAGlance({ vertical }: { vertical: string }) {
  const [days, setDays] = useState<StripDay[] | null>(null)
  const [today] = useState(localToday)

  useEffect(() => {
    let alive = true
    fetch(`/api/vendor/week-schedule?vertical=${vertical}&start=${today}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (alive && data) setDays(data.days || []) })
      .catch(() => { /* the strip is a convenience — the page works without it */ })
    return () => { alive = false }
  }, [vertical, today])

  if (days === null) return null // loading or failed — render nothing, not a spinner

  const busyDays = days.filter(d => d.entries.length > 0)

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: 8,
      border: `1px solid ${statusColors.neutral200}`,
      padding: 24,
      marginBottom: 24,
    }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px 0' }}>📅 Your next two weeks</h2>
      <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 12px 0' }}>
        Every date you&apos;re committed somewhere — including days that changed.
      </p>
      {busyDays.length === 0 ? (
        <p style={{ fontSize: 13, color: colors.textMuted, fontStyle: 'italic', margin: 0 }}>
          Nothing scheduled in the next 14 days.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {busyDays.map(day => (
            <div key={day.date} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
              <span style={{
                flexShrink: 0,
                width: 110,
                fontSize: 13,
                fontWeight: day.date === today ? 700 : 600,
                color: day.date === today ? colors.primary : statusColors.neutral600,
              }}>
                {dayLabel(day.date, today)}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                {day.entries.map((e, i) => {
                  const struck = e.status !== 'on'
                  return (
                    <div key={`${e.marketId}-${i}`} style={{ fontSize: 13, minWidth: 0 }}>
                      <span style={{
                        color: struck ? statusColors.neutral500 : statusColors.neutral800,
                        textDecoration: struck ? 'line-through' : 'none',
                      }}>
                        {e.kind === 'event' ? '🎪 ' : ''}{e.name}
                        {e.startTime && e.endTime && (
                          <span style={{ color: statusColors.neutral500 }}>
                            {' '}· {fmtTime(e.startTime)}–{fmtTime(e.endTime)}
                          </span>
                        )}
                        {KIND_LABEL[e.kind] && (
                          <span style={{
                            marginLeft: 6,
                            fontSize: 11,
                            fontWeight: 600,
                            color: e.kind === 'event' ? statusColors.info : statusColors.neutral500,
                            textTransform: 'uppercase',
                          }}>
                            {KIND_LABEL[e.kind]}
                          </span>
                        )}
                      </span>
                      {e.note && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: statusColors.warningDark }}>
                          {e.note}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
