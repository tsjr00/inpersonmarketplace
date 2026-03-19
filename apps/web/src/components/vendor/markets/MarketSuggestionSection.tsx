'use client'

import { useState } from 'react'
import { term } from '@/lib/vertical'
import { colors, statusColors, spacing } from '@/lib/design-tokens'
import { formatState, formatZip } from '@/lib/validation'
import type { MarketSuggestion, ErrorState } from './types'
import { DAYS, formatTime12h } from './utils'

interface MarketSuggestionSectionProps {
  vertical: string
  isFoodTruck: boolean
  marketSuggestions: MarketSuggestion[]
  setError: (error: ErrorState) => void
  fetchMarkets: () => Promise<void>
}

export default function MarketSuggestionSection({
  vertical,
  isFoodTruck,
  marketSuggestions,
  setError,
  fetchMarkets,
}: MarketSuggestionSectionProps) {
  const [showSuggestionForm, setShowSuggestionForm] = useState(false)
  const [submittingSuggestion, setSubmittingSuggestion] = useState(false)
  const [suggestionFormData, setSuggestionFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    latitude: '',
    longitude: '',
    description: '',
    website: '',
    season_start: '',
    season_end: '',
    schedules: [{ day_of_week: '', start_time: '08:00', end_time: '13:00' }] as { day_of_week: string; start_time: string; end_time: string }[],
    vendor_sells_at_market: true
  })

  const handleSuggestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmittingSuggestion(true)
    setError(null)

    const validSchedules = suggestionFormData.schedules.filter(s => s.day_of_week !== '' && s.start_time && s.end_time)
    if (validSchedules.length === 0) {
      setError({ error: 'At least one market day/time is required' })
      setSubmittingSuggestion(false)
      return
    }

    try {
      const res = await fetch('/api/vendor/markets/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vertical,
          name: suggestionFormData.name,
          address: suggestionFormData.address,
          city: suggestionFormData.city,
          state: suggestionFormData.state,
          zip: suggestionFormData.zip,
          description: suggestionFormData.description || null,
          website: suggestionFormData.website || null,
          latitude: suggestionFormData.latitude ? parseFloat(suggestionFormData.latitude) : null,
          longitude: suggestionFormData.longitude ? parseFloat(suggestionFormData.longitude) : null,
          season_start: suggestionFormData.season_start || null,
          season_end: suggestionFormData.season_end || null,
          schedules: validSchedules.map(s => ({
            day_of_week: parseInt(s.day_of_week),
            start_time: s.start_time,
            end_time: s.end_time
          })),
          vendor_sells_at_market: suggestionFormData.vendor_sells_at_market
        })
      })

      if (res.ok) {
        await fetchMarkets()
        resetSuggestionForm()
      } else {
        const errData = await res.json()
        setError({
          error: errData.error || 'Failed to submit market suggestion',
          code: errData.code,
          traceId: errData.traceId,
          details: errData.details
        })
      }
    } catch (err) {
      console.error('Error submitting market suggestion:', err)
      setError({ error: 'Failed to submit market suggestion' })
    } finally {
      setSubmittingSuggestion(false)
    }
  }

  const resetSuggestionForm = () => {
    setShowSuggestionForm(false)
    setSuggestionFormData({
      name: '',
      address: '',
      city: '',
      state: '',
      zip: '',
      latitude: '',
      longitude: '',
      description: '',
      website: '',
      season_start: '',
      season_end: '',
      schedules: [{ day_of_week: '', start_time: '08:00', end_time: '13:00' }],
      vendor_sells_at_market: true
    })
    setError(null)
  }

  const addSuggestionSchedule = () => {
    if (suggestionFormData.schedules.length < 7) {
      setSuggestionFormData({
        ...suggestionFormData,
        schedules: [...suggestionFormData.schedules, { day_of_week: '', start_time: '08:00', end_time: '13:00' }]
      })
    }
  }

  const removeSuggestionSchedule = (index: number) => {
    if (suggestionFormData.schedules.length > 1) {
      const newSchedules = suggestionFormData.schedules.filter((_, i) => i !== index)
      setSuggestionFormData({ ...suggestionFormData, schedules: newSchedules })
    }
  }

  const updateSuggestionSchedule = (index: number, field: string, value: string) => {
    const newSchedules = [...suggestionFormData.schedules]
    newSchedules[index] = { ...newSchedules[index], [field]: value }
    setSuggestionFormData({ ...suggestionFormData, schedules: newSchedules })
  }

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: 8,
      border: `1px solid ${statusColors.neutral200}`,
      padding: 24,
      marginBottom: 24
    }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 4px 0', fontSize: 20, fontWeight: 600 }}>
          {term(vertical, 'suggest_market_cta')}
        </h2>
        <p style={{ margin: '0 0 8px 0', fontSize: 14, color: statusColors.neutral500 }}>
          {`Know of a ${term(vertical, 'traditional_market').toLowerCase()} that isn't listed? Submit it for review and help grow our community.`}
        </p>
        {!showSuggestionForm && (
          <button
            onClick={() => setShowSuggestionForm(true)}
            style={{
              padding: '6px 14px',
              backgroundColor: colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            {term(vertical, 'suggest_market_cta')}
          </button>
        )}
      </div>

      {/* Info Notice */}
      <div style={{
        padding: 16,
        backgroundColor: colors.primaryLight,
        border: '1px solid ${colors.border}',
        borderRadius: 8,
        marginBottom: 20
      }}>
        <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: colors.primaryDark }}>
          {'ℹ️'} How {term(vertical, 'market')} Suggestions Work
        </h4>
        <p style={{ margin: 0, fontSize: 13, color: colors.primaryDark, lineHeight: 1.5 }}>
          {`When you suggest a ${term(vertical, 'traditional_market').toLowerCase()}, our team will review it to verify the information. Once approved, it will appear in the public ${term(vertical, 'traditional_markets').toLowerCase()} list and all ${term(vertical, 'vendors').toLowerCase()} can join it. This helps ensure we only list real, verified ${term(vertical, 'traditional_markets').toLowerCase()}.`}
        </p>
      </div>

      {/* Suggestion Form */}
      {showSuggestionForm && (
        <form
          onSubmit={handleSuggestionSubmit}
          style={{
            padding: 20,
            border: `1px solid ${statusColors.neutral200}`,
            borderRadius: 8,
            backgroundColor: statusColors.neutral50,
            marginBottom: 20
          }}
        >
          <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600 }}>
            New {term(vertical, 'market')} Suggestion
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                {term(vertical, 'market')} Name *
              </label>
              <input
                type="text"
                required
                value={suggestionFormData.name}
                onChange={(e) => setSuggestionFormData({ ...suggestionFormData, name: e.target.value })}
                placeholder={isFoodTruck ? 'e.g., Downtown Food Truck Park' : 'e.g., Downtown Saturday Market'}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: `1px solid ${statusColors.neutral300}`,
                  borderRadius: 6,
                  fontSize: 14,
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Do you sell at this market? */}
            <div style={{
              padding: 16,
              backgroundColor: suggestionFormData.vendor_sells_at_market ? colors.primaryLight : statusColors.warningLight,
              border: `1px solid ${suggestionFormData.vendor_sells_at_market ? colors.primary : statusColors.warningBorder}`,
              borderRadius: 8
            }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 12, color: statusColors.neutral700 }}>
                Do you sell at this {term(vertical, 'market').toLowerCase()}? *
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  backgroundColor: suggestionFormData.vendor_sells_at_market ? colors.primaryLight : 'white',
                  border: `2px solid ${suggestionFormData.vendor_sells_at_market ? colors.primary : statusColors.neutral200}`,
                  borderRadius: 6,
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="vendor_sells_at_market"
                    checked={suggestionFormData.vendor_sells_at_market === true}
                    onChange={() => setSuggestionFormData({ ...suggestionFormData, vendor_sells_at_market: true })}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontWeight: 500, color: colors.primaryDark }}>Yes, I sell at this {term(vertical, 'market').toLowerCase()}</div>
                    <div style={{ fontSize: 12, color: statusColors.neutral500 }}>I&apos;ll be associated with this {term(vertical, 'market').toLowerCase()} when approved</div>
                  </div>
                </label>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  backgroundColor: !suggestionFormData.vendor_sells_at_market ? statusColors.warningLight : 'white',
                  border: `2px solid ${!suggestionFormData.vendor_sells_at_market ? statusColors.warning : statusColors.neutral200}`,
                  borderRadius: 6,
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="vendor_sells_at_market"
                    checked={suggestionFormData.vendor_sells_at_market === false}
                    onChange={() => setSuggestionFormData({ ...suggestionFormData, vendor_sells_at_market: false })}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontWeight: 500, color: statusColors.warningDark }}>No, but I think it should be on the platform</div>
                    <div style={{ fontSize: 12, color: statusColors.neutral500 }}>This is a lead/referral for the platform to pursue</div>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                Address *
              </label>
              <input
                type="text"
                required
                value={suggestionFormData.address}
                onChange={(e) => setSuggestionFormData({ ...suggestionFormData, address: e.target.value })}
                placeholder="Street address or location description"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: `1px solid ${statusColors.neutral300}`,
                  borderRadius: 6,
                  fontSize: 14,
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>City *</label>
                <input type="text" required value={suggestionFormData.city}
                  onChange={(e) => setSuggestionFormData({ ...suggestionFormData, city: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>State *</label>
                <input type="text" required value={suggestionFormData.state}
                  onChange={(e) => setSuggestionFormData({ ...suggestionFormData, state: formatState(e.target.value) })}
                  maxLength={2} pattern="[A-Za-z]{2}" placeholder="TX"
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box', textTransform: 'uppercase' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>ZIP *</label>
                <input type="text" required inputMode="numeric" value={suggestionFormData.zip}
                  onChange={(e) => setSuggestionFormData({ ...suggestionFormData, zip: formatZip(e.target.value) })}
                  maxLength={5} pattern="\d{5}" placeholder="79101"
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Coordinates (optional) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                  Latitude <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(optional)</span>
                </label>
                <input type="text" inputMode="decimal" value={suggestionFormData.latitude}
                  onChange={(e) => setSuggestionFormData({ ...suggestionFormData, latitude: e.target.value })}
                  placeholder="e.g. 35.1983"
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                  Longitude <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(optional)</span>
                </label>
                <input type="text" inputMode="decimal" value={suggestionFormData.longitude}
                  onChange={(e) => setSuggestionFormData({ ...suggestionFormData, longitude: e.target.value })}
                  placeholder="e.g. -101.8313"
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <p style={{ margin: `0 0 ${spacing['2xs']} 0`, fontSize: 12, color: statusColors.neutral500 }}>
              Providing coordinates helps speed up approval. Find them in Google Maps by right-clicking the location.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                Description <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(optional)</span>
              </label>
              <textarea
                value={suggestionFormData.description}
                onChange={(e) => setSuggestionFormData({ ...suggestionFormData, description: e.target.value })}
                placeholder={`Any additional details about this ${term(vertical, 'market').toLowerCase()}...`}
                rows={3}
                style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                Website <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(optional)</span>
              </label>
              <input type="url" value={suggestionFormData.website}
                onChange={(e) => setSuggestionFormData({ ...suggestionFormData, website: e.target.value })}
                placeholder="https://..."
                style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            {/* Season Dates */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                  Season Start <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(optional)</span>
                </label>
                <input type="date" value={suggestionFormData.season_start}
                  onChange={(e) => setSuggestionFormData({ ...suggestionFormData, season_start: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                />
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: statusColors.neutral500 }}>When does this {term(vertical, 'market').toLowerCase()}&apos;s season begin?</p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                  Season End <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(optional)</span>
                </label>
                <input type="date" value={suggestionFormData.season_end}
                  onChange={(e) => setSuggestionFormData({ ...suggestionFormData, season_end: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                />
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: statusColors.neutral500 }}>When does this {term(vertical, 'market').toLowerCase()}&apos;s season end?</p>
              </div>
            </div>
            <p style={{ margin: '4px 0 12px 0', fontSize: 13, color: statusColors.neutral500, fontStyle: 'italic' }}>
              Leave blank if the {term(vertical, 'market').toLowerCase()} operates year-round.
            </p>

            {/* Market Schedule Section */}
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: 14, fontWeight: 500 }}>{term(vertical, 'market')} Days/Times *</label>
                {suggestionFormData.schedules.length < 7 && (
                  <button type="button" onClick={addSuggestionSchedule}
                    style={{ padding: '4px 12px', backgroundColor: statusColors.infoLight, color: statusColors.infoDark, border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    + Add Another Day
                  </button>
                )}
              </div>

              {suggestionFormData.schedules.map((schedule, index) => (
                <div key={index} style={{ padding: 12, border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, backgroundColor: 'white', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 120px', minWidth: 120 }}>
                      <label style={{ display: 'block', fontSize: 12, color: statusColors.neutral500, marginBottom: 4 }}>Day</label>
                      <select value={schedule.day_of_week} onChange={(e) => updateSuggestionSchedule(index, 'day_of_week', e.target.value)} required
                        style={{ width: '100%', padding: '8px 10px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }}>
                        <option value="">Select day...</option>
                        {DAYS.map((day, i) => (<option key={day} value={i}>{day}</option>))}
                      </select>
                    </div>
                    <div style={{ flex: '0 0 100px' }}>
                      <label style={{ display: 'block', fontSize: 12, color: statusColors.neutral500, marginBottom: 4 }}>Start Time</label>
                      <input type="time" value={schedule.start_time} onChange={(e) => updateSuggestionSchedule(index, 'start_time', e.target.value)} required
                        style={{ width: '100%', padding: '8px 10px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ flex: '0 0 100px' }}>
                      <label style={{ display: 'block', fontSize: 12, color: statusColors.neutral500, marginBottom: 4 }}>End Time</label>
                      <input type="time" value={schedule.end_time} onChange={(e) => updateSuggestionSchedule(index, 'end_time', e.target.value)} required
                        style={{ width: '100%', padding: '8px 10px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }}
                      />
                    </div>
                    {suggestionFormData.schedules.length > 1 && (
                      <button type="button" onClick={() => removeSuggestionSchedule(index)}
                        style={{ padding: '8px', backgroundColor: statusColors.dangerLight, color: statusColors.dangerDark, border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer', alignSelf: 'flex-end' }}>
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button type="submit" disabled={submittingSuggestion}
              style={{ padding: '10px 20px', backgroundColor: submittingSuggestion ? statusColors.neutral400 : colors.primary, color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: submittingSuggestion ? 'not-allowed' : 'pointer' }}>
              {submittingSuggestion ? 'Submitting...' : 'Submit for Review'}
            </button>
            <button type="button" onClick={resetSuggestionForm}
              style={{ padding: '10px 20px', backgroundColor: statusColors.neutral200, color: statusColors.neutral700, border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* My Suggestions List */}
      {marketSuggestions.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 16, fontWeight: 600 }}>My Suggestions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {marketSuggestions.map(suggestion => (
              <div key={suggestion.id} style={{
                padding: 16, border: `1px solid ${statusColors.neutral200}`, borderRadius: 8,
                backgroundColor: suggestion.approval_status === 'rejected' ? statusColors.dangerLight :
                                 suggestion.approval_status === 'approved' ? statusColors.successLight : statusColors.warningLight
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{suggestion.name}</h4>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
                    backgroundColor: suggestion.approval_status === 'rejected' ? statusColors.danger :
                                   suggestion.approval_status === 'approved' ? statusColors.success : statusColors.warning,
                    color: 'white', borderRadius: 4, fontSize: 11, fontWeight: 600, textTransform: 'capitalize'
                  }}>
                    {suggestion.approval_status === 'pending' ? 'Pending Review' : suggestion.approval_status}
                  </span>
                </div>
                <p style={{ margin: '0 0 4px 0', fontSize: 13, color: statusColors.neutral500 }}>
                  {suggestion.address}, {suggestion.city}, {suggestion.state} {suggestion.zip}
                </p>
                {suggestion.schedules && suggestion.schedules.length > 0 && (
                  <p style={{ margin: '0 0 4px 0', fontSize: 13, color: statusColors.neutral500 }}>
                    {suggestion.schedules.map((s, i) => (
                      <span key={i}>
                        {i > 0 && ', '}
                        {DAYS[s.day_of_week]} {formatTime12h(s.start_time)} - {formatTime12h(s.end_time)}
                      </span>
                    ))}
                  </p>
                )}
                <p style={{ margin: 0, fontSize: 11, color: statusColors.neutral400 }}>
                  Submitted {new Date(suggestion.submitted_at).toLocaleDateString()}
                </p>
                {suggestion.approval_status === 'rejected' && suggestion.rejection_reason && (
                  <div style={{ marginTop: 12, padding: '10px 12px', backgroundColor: statusColors.dangerLight, borderRadius: 6, fontSize: 13, color: statusColors.dangerDark }}>
                    <strong>Reason:</strong> {suggestion.rejection_reason}
                  </div>
                )}
                {suggestion.approval_status === 'approved' && (
                  <div style={{ marginTop: 12, padding: '10px 12px', backgroundColor: colors.primaryLight, borderRadius: 6, fontSize: 13, color: colors.primaryDark }}>
                    This {term(vertical, 'traditional_market').toLowerCase()} has been approved and is now available in the {term(vertical, 'traditional_markets')} list above.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
