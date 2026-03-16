'use client'

import { useState } from 'react'
import { term } from '@/lib/vertical'
import { colors, statusColors } from '@/lib/design-tokens'
import MarketScheduleSelector from '@/components/vendor/MarketScheduleSelector'
import type { Market, ErrorState } from './types'
import { DAYS } from './utils'

interface EventMarketsSectionProps {
  vertical: string
  eventMarkets: Market[]
  setError: (error: ErrorState) => void
  fetchMarkets: () => Promise<void>
  selectedMarketForSchedule: Market | null
  setSelectedMarketForSchedule: (market: Market | null) => void
}

export default function EventMarketsSection({
  vertical,
  eventMarkets,
  setError,
  fetchMarkets,
  selectedMarketForSchedule,
  setSelectedMarketForSchedule,
}: EventMarketsSectionProps) {
  const [showEventSuggestionForm, setShowEventSuggestionForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: 8,
      border: `1px solid ${statusColors.neutral200}`,
      padding: 24,
      marginBottom: 24
    }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px 0' }}>
          🎪 {term(vertical, 'events')}
        </h2>
        <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 8px 0' }}>
          Upcoming festivals, fairs, and special events. Events don&apos;t count against your location limits.
        </p>
        <button
          onClick={() => setShowEventSuggestionForm(!showEventSuggestionForm)}
          style={{
            padding: '6px 14px',
            backgroundColor: showEventSuggestionForm ? colors.textMuted : 'white',
            color: showEventSuggestionForm ? 'white' : colors.primary,
            border: `1px solid ${showEventSuggestionForm ? colors.textMuted : colors.primary}`,
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {showEventSuggestionForm ? 'Cancel' : 'Suggest an Event'}
        </button>
      </div>

      {/* Event Suggestion Form */}
      {showEventSuggestionForm && (
        <div style={{
          backgroundColor: statusColors.infoLight,
          border: `1px solid ${statusColors.infoBorder}`,
          borderRadius: 8,
          padding: 20,
          marginBottom: 16
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>Suggest an Event</h3>
          <p style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>
            Know about an upcoming event? Submit it for admin approval. Include the event name, location, dates, and schedule.
          </p>
          <form onSubmit={async (e) => {
            e.preventDefault()
            setSubmitting(true)
            setError(null)
            const form = e.target as HTMLFormElement
            const formEl = new FormData(form)
            const name = formEl.get('event_name') as string
            const address = formEl.get('event_address') as string
            const city = formEl.get('event_city') as string
            const state = formEl.get('event_state') as string
            const zip = formEl.get('event_zip') as string
            const event_start_date = formEl.get('event_start_date') as string
            const event_end_date = formEl.get('event_end_date') as string
            const event_url = formEl.get('event_url') as string
            const description = formEl.get('event_description') as string
            const scheduleDay = formEl.get('event_schedule_day') as string
            const scheduleStart = formEl.get('event_schedule_start') as string
            const scheduleEnd = formEl.get('event_schedule_end') as string

            if (!name || !address || !city || !state || !zip || !event_start_date || !event_end_date || !scheduleDay) {
              setError({ error: 'Please fill in all required fields' })
              setSubmitting(false)
              return
            }

            try {
              const res = await fetch('/api/vendor/markets/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  vertical,
                  market_type: 'event',
                  name,
                  address,
                  city,
                  state,
                  zip,
                  description: description || undefined,
                  event_start_date,
                  event_end_date,
                  event_url: event_url || undefined,
                  schedules: [{ day_of_week: parseInt(scheduleDay), start_time: scheduleStart || '10:00', end_time: scheduleEnd || '22:00' }],
                  vendor_sells_at_market: true
                })
              })
              const data = await res.json()
              if (res.ok) {
                setShowEventSuggestionForm(false)
                form.reset()
                fetchMarkets()
              } else {
                setError({ error: data.error || 'Failed to submit event suggestion' })
              }
            } catch {
              setError({ error: 'Failed to submit event suggestion' })
            } finally {
              setSubmitting(false)
            }
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Event Name *</label>
                <input name="event_name" required style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Event URL</label>
                <input name="event_url" type="url" placeholder="https://..." style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Start Date *</label>
                <input name="event_start_date" type="date" required style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>End Date *</label>
                <input name="event_end_date" type="date" required style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Address *</label>
              <input name="event_address" required style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>City *</label>
                <input name="event_city" required style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>State *</label>
                <input name="event_state" required maxLength={2} style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>ZIP *</label>
                <input name="event_zip" required style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Primary Day *</label>
                <select name="event_schedule_day" required style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }}>
                  <option value="">Select...</option>
                  {DAYS.map((day, i) => <option key={i} value={i}>{day}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Start Time</label>
                <input name="event_schedule_start" type="time" defaultValue="10:00" style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600 }}>End Time</label>
                <input name="event_schedule_end" type="time" defaultValue="22:00" style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4 }} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Description</label>
              <textarea name="event_description" rows={2} style={{ width: '100%', padding: 8, borderRadius: 6, border: `1px solid ${statusColors.neutral300}`, marginTop: 4, resize: 'vertical' }} />
            </div>
            <button type="submit" disabled={submitting}
              style={{
                padding: '10px 20px', backgroundColor: colors.primary, color: 'white', border: 'none',
                borderRadius: 6, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1, fontWeight: 600
              }}>
              {submitting ? 'Submitting...' : 'Submit Event Suggestion'}
            </button>
          </form>
        </div>
      )}

      {/* Event Markets List */}
      {eventMarkets.length === 0 && !showEventSuggestionForm ? (
        <p style={{ fontSize: 13, color: colors.textMuted, fontStyle: 'italic', margin: 0 }}>
          No upcoming events. Suggest an event to get started!
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {eventMarkets.map(market => (
            <div key={market.id} style={{ border: `1px solid ${statusColors.neutral200}`, borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>🎪 {market.name}</h3>
                  <p style={{ fontSize: 13, color: colors.textMuted, margin: '4px 0' }}>
                    {market.address}, {market.city}, {market.state}
                  </p>
                  {market.event_start_date && (
                    <p style={{ fontSize: 13, color: colors.primary, fontWeight: 600, margin: '4px 0' }}>
                      {new Date(market.event_start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {market.event_end_date !== market.event_start_date && (
                        <> – {new Date(market.event_end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                      )}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{
                    padding: '4px 10px',
                    backgroundColor: market.hasAttendance ? statusColors.successLight : statusColors.warningLight,
                    color: market.hasAttendance ? statusColors.success : statusColors.warning,
                    borderRadius: 12, fontSize: 12, fontWeight: 600
                  }}>
                    {market.hasAttendance ? 'Attending' : 'Not Attending'}
                  </span>
                </div>
              </div>
              {!market.hasAttendance && (
                <button onClick={() => setSelectedMarketForSchedule(market)}
                  style={{
                    marginTop: 8, padding: '6px 14px', backgroundColor: 'white', color: colors.primary,
                    border: `1px solid ${colors.primary}`, borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500
                  }}>
                  Set Schedule
                </button>
              )}
              {market.hasAttendance && (
                <button onClick={() => setSelectedMarketForSchedule(market)}
                  style={{
                    marginTop: 8, padding: '6px 14px', backgroundColor: 'transparent', color: colors.textMuted,
                    border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, cursor: 'pointer', fontSize: 13
                  }}>
                  Manage Schedule
                </button>
              )}
              {selectedMarketForSchedule?.id === market.id && (
                <div style={{ marginTop: 16 }}>
                  <MarketScheduleSelector
                    marketId={market.id}
                    marketName={market.name}
                    vertical={vertical}
                    marketType="event"
                    onClose={() => { setSelectedMarketForSchedule(null); fetchMarkets() }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
