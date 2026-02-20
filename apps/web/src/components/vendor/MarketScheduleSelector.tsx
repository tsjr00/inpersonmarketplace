'use client'

import { useState, useEffect } from 'react'
import { colors } from '@/lib/design-tokens'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface Schedule {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_attending: boolean
  vendor_start_time: string | null
  vendor_end_time: string | null
  market_start_time: string
  market_end_time: string
}

interface MarketScheduleSelectorProps {
  marketId: string
  marketName: string
  vertical?: string
  marketType?: 'traditional' | 'private_pickup' | 'event'
  onClose?: () => void
}

// Format 24h time to 12h
function formatTime12h(time24: string): string {
  if (!time24) return ''
  const [hours, minutes] = time24.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const hours12 = hours % 12 || 12
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`
}

// Format HH:MM:SS to HH:MM for input[type=time]
function toTimeInput(time: string | null): string {
  if (!time) return ''
  return time.substring(0, 5)
}

export default function MarketScheduleSelector({
  marketId,
  marketName,
  vertical,
  marketType,
  onClose
}: MarketScheduleSelectorProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [hasAnyActive, setHasAnyActive] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null) // schedule ID being saved
  const [saved, setSaved] = useState<string | null>(null) // schedule ID just saved
  const [error, setError] = useState<string | null>(null)
  const [errorType, setErrorType] = useState<'warning' | 'blocking'>('warning')

  const isFT = vertical === 'food_trucks'
  const isEvent = marketType === 'event'
  const locationLabel = isEvent ? 'event' : isFT ? 'park' : 'market'

  useEffect(() => {
    fetchSchedules()
  }, [marketId])

  const fetchSchedules = async () => {
    try {
      const res = await fetch(`/api/vendor/markets/${marketId}/schedules`)
      if (res.ok) {
        const data = await res.json()
        setSchedules(data.schedules || [])
        setHasAnyActive(data.hasAnyActive)
      } else {
        const errData = await res.json()
        setError(errData.error || 'Failed to load schedules')
      }
    } catch (err) {
      console.error('Error fetching schedules:', err)
      setError('Failed to load schedules')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleSchedule = async (scheduleId: string, currentlyAttending: boolean) => {
    setSaving(scheduleId)
    setError(null)

    // When toggling ON for FT, pre-fill vendor times with market times
    const schedule = schedules.find(s => s.id === scheduleId)
    const patchBody: Record<string, unknown> = {
      scheduleId,
      isActive: !currentlyAttending
    }
    if ((isFT || isEvent) && !currentlyAttending && schedule) {
      // Pre-fill vendor times with market hours when first toggling on
      patchBody.startTime = schedule.market_start_time
      patchBody.endTime = schedule.market_end_time
    }

    try {
      const res = await fetch(`/api/vendor/markets/${marketId}/schedules`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody)
      })

      const data = await res.json()

      if (res.ok) {
        // Update local state
        setSchedules(prev =>
          prev.map(s => {
            if (s.id !== scheduleId) return s
            const updated = { ...s, is_attending: !currentlyAttending }
            // Set vendor times when toggling ON for FT/events
            if ((isFT || isEvent) && !currentlyAttending) {
              updated.vendor_start_time = s.market_start_time
              updated.vendor_end_time = s.market_end_time
            }
            return updated
          })
        )
        setHasAnyActive(data.hasAnyActive)
        setErrorType('warning')

        if (data.warning) {
          setError(data.warning)
        }
      } else {
        if (data.code === 'ERR_SCHEDULE_HAS_ORDERS') {
          setErrorType('blocking')
        } else {
          setErrorType('warning')
        }
        setError(data.error || 'Failed to update schedule')
      }
    } catch (err) {
      console.error('Error toggling schedule:', err)
      setError('Failed to update schedule')
    } finally {
      setSaving(null)
    }
  }

  const saveVendorTime = async (scheduleId: string, field: 'startTime' | 'endTime', value: string) => {
    setSaving(scheduleId)
    setSaved(null)
    setError(null)

    try {
      const res = await fetch(`/api/vendor/markets/${marketId}/schedules`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId,
          isActive: true,
          [field]: value || null
        })
      })

      const data = await res.json()
      if (!res.ok) {
        setErrorType('warning')
        setError(data.error || 'Failed to update time')
      } else {
        setSaved(scheduleId)
        setTimeout(() => setSaved(prev => prev === scheduleId ? null : prev), 2000)
      }
    } catch (err) {
      console.error('Error updating vendor time:', err)
      setError('Failed to update time')
    } finally {
      setSaving(null)
    }
  }

  const handleVendorTimeChange = (scheduleId: string, field: 'startTime' | 'endTime', value: string) => {
    // Update local state immediately for responsiveness
    setSchedules(prev =>
      prev.map(s => {
        if (s.id !== scheduleId) return s
        return {
          ...s,
          vendor_start_time: field === 'startTime' ? (value || null) : s.vendor_start_time,
          vendor_end_time: field === 'endTime' ? (value || null) : s.vendor_end_time
        }
      })
    )
  }

  const handleVendorTimeBlur = (scheduleId: string, field: 'startTime' | 'endTime', value: string) => {
    // Save on blur — this is the reliable save trigger across all browsers
    saveVendorTime(scheduleId, field, value)
  }

  if (loading) {
    return (
      <div style={{
        padding: 20,
        backgroundColor: 'white',
        borderRadius: 8,
        border: '1px solid #e5e7eb'
      }}>
        <p style={{ margin: 0, color: '#6b7280' }}>Loading schedules...</p>
      </div>
    )
  }

  return (
    <div style={{
      padding: 20,
      backgroundColor: 'white',
      borderRadius: 8,
      border: '1px solid #e5e7eb'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16
      }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 600 }}>
            {marketName}
          </h3>
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
            {isEvent
              ? "Select the days you'll be at this event"
              : isFT
                ? "Select the days you're at this park"
                : 'Select the days you attend this market'}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              padding: '6px 12px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        )}
      </div>

      {/* Warning if no schedules selected */}
      {!hasAnyActive && (
        <div style={{
          padding: 12,
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 13,
          color: '#991b1b'
        }}>
          {`You haven't selected any days. Your ${isFT ? 'menu' : 'listings'} won't appear for this ${locationLabel} until you select at least one day.`}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={{
          padding: 12,
          backgroundColor: errorType === 'blocking' ? '#fef2f2' : '#fef3c7',
          border: `1px solid ${errorType === 'blocking' ? '#fecaca' : '#fcd34d'}`,
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 13,
          color: errorType === 'blocking' ? '#991b1b' : '#92400e'
        }}>
          {errorType === 'blocking' && (
            <strong style={{ display: 'block', marginBottom: 4 }}>Cannot deactivate</strong>
          )}
          {error}
        </div>
      )}

      {/* Schedule checkboxes */}
      {schedules.length === 0 ? (
        <p style={{ margin: 0, color: '#6b7280', fontStyle: 'italic' }}>
          No schedules found for this {locationLabel}.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {schedules.map(schedule => (
            <div key={schedule.id}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  backgroundColor: schedule.is_attending ? colors.primaryLight : '#f9fafb',
                  border: `2px solid ${schedule.is_attending ? colors.primary : '#e5e7eb'}`,
                  borderRadius: (isFT || isEvent) && schedule.is_attending ? '8px 8px 0 0' : 8,
                  cursor: saving === schedule.id ? 'wait' : 'pointer',
                  opacity: saving === schedule.id ? 0.7 : 1,
                  transition: 'all 0.2s ease'
                }}
              >
                <input
                  type="checkbox"
                  checked={schedule.is_attending}
                  disabled={saving === schedule.id}
                  onChange={() => handleToggleSchedule(schedule.id, schedule.is_attending)}
                  style={{
                    width: 20,
                    height: 20,
                    accentColor: colors.primary,
                    cursor: saving === schedule.id ? 'wait' : 'pointer'
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontWeight: 600,
                    fontSize: 15,
                    color: schedule.is_attending ? colors.primaryDark : '#374151'
                  }}>
                    {DAYS[schedule.day_of_week]}
                  </div>
                  <div style={{
                    fontSize: 13,
                    color: schedule.is_attending ? colors.primaryDark : '#6b7280'
                  }}>
                    {isFT && schedule.is_attending && schedule.vendor_start_time
                      ? `${formatTime12h(schedule.vendor_start_time)} - ${formatTime12h(schedule.vendor_end_time || schedule.market_end_time)}`
                      : `${formatTime12h(schedule.market_start_time || schedule.start_time)} - ${formatTime12h(schedule.market_end_time || schedule.end_time)}`
                    }
                  </div>
                </div>
                {schedule.is_attending && (
                  <span style={{
                    padding: '4px 10px',
                    backgroundColor: colors.primary,
                    color: 'white',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                    {isEvent ? 'Attending' : isFT ? 'At this park' : 'Attending'}
                  </span>
                )}
                {saving === schedule.id && (
                  <span style={{
                    fontSize: 12,
                    color: '#6b7280'
                  }}>
                    Saving...
                  </span>
                )}
              </label>

              {/* FT/Events: Vendor-specific time pickers (shown when attending) */}
              {(isFT || isEvent) && schedule.is_attending && (
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#f0fdf4',
                  border: `2px solid ${colors.primary}`,
                  borderTop: 'none',
                  borderRadius: '0 0 8px 8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {isEvent ? 'Event' : 'Park'} hours: {formatTime12h(schedule.market_start_time || schedule.start_time)} - {formatTime12h(schedule.market_end_time || schedule.end_time)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 13, color: '#374151', fontWeight: 500, minWidth: 70 }}>
                      Your hours:
                    </label>
                    <input
                      type="time"
                      value={toTimeInput(schedule.vendor_start_time)}
                      min={toTimeInput(schedule.market_start_time || schedule.start_time)}
                      max={toTimeInput(schedule.market_end_time || schedule.end_time)}
                      onChange={(e) => handleVendorTimeChange(schedule.id, 'startTime', e.target.value)}
                      onBlur={(e) => handleVendorTimeBlur(schedule.id, 'startTime', e.target.value)}
                      disabled={saving === schedule.id}
                      style={{
                        padding: '4px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: 4,
                        fontSize: 13
                      }}
                    />
                    <span style={{ fontSize: 13, color: '#6b7280' }}>to</span>
                    <input
                      type="time"
                      value={toTimeInput(schedule.vendor_end_time)}
                      min={toTimeInput(schedule.market_start_time || schedule.start_time)}
                      max={toTimeInput(schedule.market_end_time || schedule.end_time)}
                      onChange={(e) => handleVendorTimeChange(schedule.id, 'endTime', e.target.value)}
                      onBlur={(e) => handleVendorTimeBlur(schedule.id, 'endTime', e.target.value)}
                      disabled={saving === schedule.id}
                      style={{
                        padding: '4px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: 4,
                        fontSize: 13
                      }}
                    />
                    {saving === schedule.id && (
                      <span style={{ fontSize: 12, color: '#6b7280' }}>Saving...</span>
                    )}
                    {saved === schedule.id && !saving && (
                      <span style={{ fontSize: 12, color: colors.primary, fontWeight: 600 }}>Saved</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info about pickup dates */}
      <div style={{
        marginTop: 16,
        padding: 12,
        backgroundColor: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: 6,
        fontSize: 13,
        color: '#1e40af'
      }}>
        <strong>How this works:</strong>{' '}
        {isEvent
          ? "When customers pre-order for this event, they'll pick a time slot within the hours you set. Only days you've selected will show as available."
          : isFT
            ? "When customers order from you at this park, they'll pick a time slot within the hours you set. Only days you've selected will show as available."
            : "When buyers order from you at this market, their pickup date will be calculated based on the days you've selected. Orders will be assigned to your next available market day."}
      </div>
    </div>
  )
}
