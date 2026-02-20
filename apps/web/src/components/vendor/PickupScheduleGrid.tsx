'use client'

import { useMemo } from 'react'
import { colors } from '@/lib/design-tokens'
import { getMapsUrl } from '@/lib/utils/maps-link'

interface PickupLocation {
  id: string
  name: string
  address?: string
  city?: string
  state?: string
  market_type?: 'private_pickup' | 'traditional' | 'event'
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
  // Only show minutes if not :00
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
  const dayOfWeek = now.getDay() // 0 = Sunday

  // Get Monday of current week (if Sunday, go back 6 days)
  const monday = new Date(now)
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  monday.setDate(now.getDate() - daysToMonday)
  monday.setHours(0, 0, 0, 0)

  // Get Sunday of current week
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return {
    start: monday,
    end: sunday,
    label: `Availability for the week of ${formatDate(monday)} - ${formatDate(sunday)}`
  }
}

export default function PickupScheduleGrid({ locations }: PickupScheduleGridProps) {
  const weekInfo = useMemo(() => getWeekDates(), [])

  // Build schedule matrix: location -> day -> time ranges
  const scheduleMatrix = useMemo(() => {
    const matrix: Map<string, Map<number, string[]>> = new Map()

    for (const location of locations) {
      const dayMap = new Map<number, string[]>()
      for (let d = 0; d < 7; d++) {
        dayMap.set(d, [])
      }

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
  }, [locations])

  // Reorder days to start with Monday (1,2,3,4,5,6,0)
  const orderedDays = [1, 2, 3, 4, 5, 6, 0]

  return (
    <div style={{
      backgroundColor: '#fef3c7',
      border: '1px solid #fcd34d',
      borderRadius: 8,
      marginBottom: 16,
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid #fcd34d',
        backgroundColor: '#fef3c7'
      }}>
        <span style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#92400e'
        }}>
          {weekInfo.label}
        </span>
      </div>

      {/* Desktop Grid View */}
      <div className="pickup-schedule-desktop" style={{
        padding: '12px 16px',
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
                color: '#78350f',
                fontWeight: 600,
                borderBottom: '1px solid #fcd34d',
                minWidth: 120
              }}>
                Location
              </th>
              {orderedDays.map(day => (
                <th key={day} style={{
                  textAlign: 'center',
                  padding: '6px 4px',
                  color: '#78350f',
                  fontWeight: 600,
                  borderBottom: '1px solid #fcd34d',
                  minWidth: 60
                }}>
                  <span className="day-full">{DAYS_FULL[day]}</span>
                  <span className="day-short">{DAYS_SHORT[day]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locations.map(location => {
              const dayMap = scheduleMatrix.get(location.id)
              return (
                <tr key={location.id}>
                  <td style={{
                    padding: '8px 8px',
                    color: '#78350f',
                    fontWeight: 500,
                    verticalAlign: 'top'
                  }}>
                    <div style={{ fontWeight: 600 }}>{location.name}</div>
                    {(location.city || location.address) && (
                      <a
                        href={getMapsUrl(location.address, location.city, location.state)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'block', fontSize: 11, color: '#92400e', marginTop: 2, textDecoration: 'none' }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                      >
                        {[location.city, location.state].filter(Boolean).join(', ')}
                      </a>
                    )}
                  </td>
                  {orderedDays.map(day => {
                    const times = dayMap?.get(day) || []
                    return (
                      <td key={day} style={{
                        textAlign: 'center',
                        padding: '8px 4px',
                        color: times.length > 0 ? colors.primaryDark : '#d1d5db',
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
                              fontWeight: 500,
                              whiteSpace: 'nowrap'
                            }}>
                              {time}
                            </div>
                          ))
                        ) : (
                          <span style={{ fontSize: 14 }}>—</span>
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
        padding: '12px 16px'
      }}>
        {locations.map((location, locIndex) => {
          const dayMap = scheduleMatrix.get(location.id)
          const hasAnySchedule = orderedDays.some(d => (dayMap?.get(d) || []).length > 0)

          return (
            <div
              key={location.id}
              style={{
                marginBottom: locIndex < locations.length - 1 ? 16 : 0,
                paddingBottom: locIndex < locations.length - 1 ? 16 : 0,
                borderBottom: locIndex < locations.length - 1 ? '1px solid #fcd34d' : 'none'
              }}
            >
              <div style={{
                fontWeight: 600,
                color: '#78350f',
                marginBottom: 4
              }}>
                {location.name}
              </div>
              {(location.city || location.address) && (
                <a
                  href={getMapsUrl(location.address, location.city, location.state)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'block', fontSize: 12, color: '#92400e', marginBottom: 8, textDecoration: 'none' }}
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
                        fontWeight: 500
                      }}>
                        <span style={{ fontWeight: 600 }}>{DAYS_FULL[day]}</span>
                        {' '}
                        {times.join(', ')}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#92400e', fontStyle: 'italic' }}>
                  No scheduled times
                </div>
              )}
            </div>
          )
        })}
      </div>

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
