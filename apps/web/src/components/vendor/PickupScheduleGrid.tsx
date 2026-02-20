'use client'

import { useMemo } from 'react'
import { colors, statusColors, spacing, radius, typography } from '@/lib/design-tokens'
import { getMapsUrl } from '@/lib/utils/maps-link'

interface PickupLocation {
  id: string
  name: string
  address?: string
  city?: string
  state?: string
  market_type?: 'private_pickup' | 'traditional' | 'event'
  event_start_date?: string | null
  event_end_date?: string | null
  schedules?: { day_of_week: number; start_time: string; end_time: string }[]
}

interface PickupScheduleGridProps {
  locations: PickupLocation[]
}

const DAYS_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':')
  const hour = parseInt(hours)
  const ampm = hour >= 12 ? 'p' : 'a'
  const displayHour = hour % 12 || 12
  if (minutes === '00') {
    return `${displayHour}${ampm}`
  }
  return `${displayHour}:${minutes}${ampm}`
}

function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)}-${formatTime(end)}`
}

function getWeekDates(): { start: Date; end: Date; label: string } {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const monday = new Date(now)
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  monday.setDate(now.getDate() - daysToMonday)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return {
    start: monday,
    end: sunday,
    label: `Availability for the week of ${formatDate(monday)} - ${formatDate(sunday)}`
  }
}

function formatEventDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function PickupScheduleGrid({ locations }: PickupScheduleGridProps) {
  const weekInfo = useMemo(() => getWeekDates(), [])

  const regularLocations = locations.filter(loc => loc.market_type !== 'event')
  const eventLocations = locations.filter(loc => loc.market_type === 'event' && loc.event_start_date)

  const scheduleMatrix = useMemo(() => {
    const matrix: Map<string, Map<number, string[]>> = new Map()
    for (const location of regularLocations) {
      const dayMap = new Map<number, string[]>()
      for (let d = 0; d < 7; d++) dayMap.set(d, [])
      if (location.schedules) {
        for (const schedule of location.schedules) {
          const times = dayMap.get(schedule.day_of_week) || []
          times.push(formatTimeRange(schedule.start_time, schedule.end_time))
          dayMap.set(schedule.day_of_week, times)
        }
      }
      matrix.set(location.id, dayMap)
    }
    return matrix
  }, [regularLocations])

  const orderedDays = [1, 2, 3, 4, 5, 6, 0]

  return (
    <div style={{
      backgroundColor: colors.surfaceMuted,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      marginBottom: parseInt(spacing.sm),
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: `${spacing.xs} ${spacing.sm}`,
        borderBottom: `1px solid ${colors.border}`,
        backgroundColor: colors.surfaceMuted
      }}>
        <span style={{
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold,
          color: colors.textSecondary
        }}>
          {weekInfo.label}
        </span>
      </div>

      {/* Desktop Grid View */}
      <div className="pickup-schedule-desktop" style={{
        padding: `${spacing.xs} ${spacing.sm}`,
        overflowX: 'auto'
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 13
        }}>
          <thead>
            <tr>
              <th style={{
                textAlign: 'left',
                padding: '6px 8px',
                color: colors.textPrimary,
                fontWeight: typography.weights.semibold,
                borderBottom: `1px solid ${colors.border}`,
                minWidth: 120
              }}>
                Location
              </th>
              {orderedDays.map(day => (
                <th key={day} style={{
                  textAlign: 'center',
                  padding: '6px 4px',
                  color: colors.textPrimary,
                  fontWeight: typography.weights.semibold,
                  borderBottom: `1px solid ${colors.border}`,
                  minWidth: 60
                }}>
                  <span className="day-full">{DAYS_FULL[day]}</span>
                  <span className="day-short">{DAYS_SHORT[day]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {regularLocations.map(location => {
              const dayMap = scheduleMatrix.get(location.id)
              return (
                <tr key={location.id}>
                  <td style={{
                    padding: '8px 8px',
                    color: colors.textPrimary,
                    fontWeight: typography.weights.medium,
                    verticalAlign: 'top'
                  }}>
                    <div style={{ fontWeight: typography.weights.semibold }}>{location.name}</div>
                    {(location.city || location.address) && (
                      <a
                        href={getMapsUrl(location.address, location.city, location.state)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'block', fontSize: 11, color: colors.textMuted, marginTop: 2, textDecoration: 'none' }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                      >
                        {[location.address, location.city, location.state].filter(Boolean).join(', ')}
                      </a>
                    )}
                  </td>
                  {orderedDays.map(day => {
                    const times = dayMap?.get(day) || []
                    return (
                      <td key={day} style={{
                        textAlign: 'center',
                        padding: '8px 4px',
                        color: times.length > 0 ? colors.primaryDark : statusColors.neutral300,
                        verticalAlign: 'top',
                        fontSize: 12
                      }}>
                        {times.length > 0 ? (
                          times.map((time, i) => (
                            <div key={i} style={{
                              backgroundColor: colors.primaryLight,
                              borderRadius: 4,
                              padding: '2px 4px',
                              marginBottom: i < times.length - 1 ? 2 : 0,
                              fontWeight: typography.weights.medium,
                              whiteSpace: 'nowrap'
                            }}>
                              {time}
                            </div>
                          ))
                        ) : (
                          <span style={{ fontSize: 14 }}>{'\u2014'}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Stacked View */}
      <div className="pickup-schedule-mobile" style={{
        padding: `${spacing.xs} ${spacing.sm}`
      }}>
        {regularLocations.map((location, locIndex) => {
          const dayMap = scheduleMatrix.get(location.id)
          const hasAnySchedule = orderedDays.some(d => (dayMap?.get(d) || []).length > 0)

          return (
            <div
              key={location.id}
              style={{
                marginBottom: locIndex < regularLocations.length - 1 ? 16 : 0,
                paddingBottom: locIndex < regularLocations.length - 1 ? 16 : 0,
                borderBottom: locIndex < regularLocations.length - 1 ? `1px solid ${colors.border}` : 'none'
              }}
            >
              <div style={{
                fontWeight: typography.weights.semibold,
                color: colors.textPrimary,
                marginBottom: 4
              }}>
                {location.name}
              </div>
              {(location.city || location.address) && (
                <a
                  href={getMapsUrl(location.address, location.city, location.state)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'block', fontSize: 12, color: colors.textMuted, marginBottom: 8, textDecoration: 'none' }}
                  onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                  onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                >
                  {[location.address, location.city, location.state].filter(Boolean).join(', ')}
                </a>
              )}
              {hasAnySchedule ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {orderedDays.map(day => {
                    const times = dayMap?.get(day) || []
                    if (times.length === 0) return null
                    return (
                      <div key={day} style={{
                        backgroundColor: colors.primaryLight,
                        borderRadius: 6,
                        padding: '4px 8px',
                        fontSize: 12,
                        color: colors.primaryDark,
                        fontWeight: typography.weights.medium
                      }}>
                        <span style={{ fontWeight: typography.weights.semibold }}>{DAYS_FULL[day]}</span>
                        {' '}
                        {times.join(', ')}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: colors.textMuted, fontStyle: 'italic' }}>
                  No scheduled times
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Event Locations */}
      {eventLocations.length > 0 && (
        <div style={{
          padding: `${spacing.xs} ${spacing.sm}`,
          borderTop: regularLocations.length > 0 ? `1px solid ${colors.border}` : 'none',
        }}>
          {eventLocations.map((event, idx) => {
            const isSingleDay = event.event_start_date === event.event_end_date
            return (
              <div key={event.id} style={{
                marginBottom: idx < eventLocations.length - 1 ? 12 : 0,
                paddingBottom: idx < eventLocations.length - 1 ? 12 : 0,
                borderBottom: idx < eventLocations.length - 1 ? `1px solid ${colors.border}` : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 14 }}>{'\u{1F3AA}'}</span>
                  <span style={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}>{event.name}</span>
                  <span style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    backgroundColor: statusColors.warningLight,
                    color: statusColors.warningDark,
                    borderRadius: 4,
                    fontWeight: typography.weights.semibold,
                  }}>Event</span>
                </div>
                {(event.city || event.address) && (
                  <a
                    href={getMapsUrl(event.address, event.city, event.state)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'block', fontSize: 12, color: colors.textMuted, marginBottom: 4, textDecoration: 'none' }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                  >
                    {[event.address, event.city, event.state].filter(Boolean).join(', ')}
                  </a>
                )}
                <div style={{
                  display: 'inline-block',
                  backgroundColor: colors.primaryLight,
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontSize: 12,
                  color: colors.primaryDark,
                  fontWeight: typography.weights.medium,
                }}>
                  {isSingleDay
                    ? formatEventDate(event.event_start_date!)
                    : `${formatEventDate(event.event_start_date!)} \u2013 ${formatEventDate(event.event_end_date!)}`
                  }
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Responsive CSS */}
      <style>{`
        .pickup-schedule-desktop {
          display: block;
        }
        .pickup-schedule-mobile {
          display: none;
        }
        .pickup-schedule-desktop .day-full {
          display: inline;
        }
        .pickup-schedule-desktop .day-short {
          display: none;
        }

        @media (max-width: 640px) {
          .pickup-schedule-desktop {
            display: none;
          }
          .pickup-schedule-mobile {
            display: block;
          }
        }

        @media (min-width: 641px) and (max-width: 800px) {
          .pickup-schedule-desktop .day-full {
            display: none;
          }
          .pickup-schedule-desktop .day-short {
            display: inline;
          }
        }
      `}</style>
    </div>
  )
}
