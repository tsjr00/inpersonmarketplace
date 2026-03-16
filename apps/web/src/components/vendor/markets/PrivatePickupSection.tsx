'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { term } from '@/lib/vertical'
import { colors, statusColors } from '@/lib/design-tokens'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import type { Market, MarketLimits, ErrorState } from './types'
import { DAYS, formatTime12h, getDefaultCutoffHours, getCutoffDisplay } from './utils'

interface PrivatePickupSectionProps {
  vertical: string
  isFoodTruck: boolean
  privatePickupMarkets: Market[]
  limits: MarketLimits | null
  isPremium: boolean
  setError: (error: ErrorState) => void
  fetchMarkets: () => Promise<void>
}

export default function PrivatePickupSection({
  vertical,
  isFoodTruck,
  privatePickupMarkets,
  limits,
  isPremium,
  setError,
  fetchMarkets,
}: PrivatePickupSectionProps) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingMarket, setEditingMarket] = useState<Market | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [expandedPickupIds, setExpandedPickupIds] = useState<Set<string>>(new Set())
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    latitude: '',
    longitude: '',
    season_start: '',
    season_end: '',
    expires_at: '',
    pickup_windows: [{ day_of_week: '', start_time: '09:00', end_time: '12:00' }] as { day_of_week: string; start_time: string; end_time: string }[]
  })

  const maxPickupWindows = isPremium ? 6 : 2

  const addPickupWindow = () => {
    if (formData.pickup_windows.length < maxPickupWindows) {
      setFormData({
        ...formData,
        pickup_windows: [...formData.pickup_windows, { day_of_week: '', start_time: '09:00', end_time: '12:00' }]
      })
    }
  }

  const removePickupWindow = (index: number) => {
    if (formData.pickup_windows.length > 1) {
      const newWindows = formData.pickup_windows.filter((_, i) => i !== index)
      setFormData({ ...formData, pickup_windows: newWindows })
    }
  }

  const updatePickupWindow = (index: number, field: string, value: string) => {
    const newWindows = [...formData.pickup_windows]
    newWindows[index] = { ...newWindows[index], [field]: value }
    setFormData({ ...formData, pickup_windows: newWindows })
  }

  const resetForm = () => {
    setShowForm(false)
    setEditingMarket(null)
    setFormData({
      name: '', address: '', city: '', state: '', zip: '',
      latitude: '', longitude: '', season_start: '', season_end: '', expires_at: '',
      pickup_windows: [{ day_of_week: '', start_time: '09:00', end_time: '12:00' }]
    })
    setError(null)
  }

  const handleEdit = (market: Market) => {
    setEditingMarket(market)
    const windows = market.schedules && market.schedules.length > 0
      ? market.schedules.map(s => ({
          day_of_week: String(s.day_of_week),
          start_time: s.start_time,
          end_time: s.end_time
        }))
      : [{ day_of_week: '', start_time: '09:00', end_time: '12:00' }]
    setFormData({
      name: market.name,
      address: market.address,
      city: market.city,
      state: market.state,
      zip: market.zip,
      latitude: market.latitude?.toString() || '',
      longitude: market.longitude?.toString() || '',
      season_start: market.season_start || '',
      season_end: market.season_end || '',
      expires_at: market.expires_at ? market.expires_at.split('T')[0] : '',
      pickup_windows: windows
    })
    setShowForm(true)
    setError(null)
  }

  const handleDelete = async (marketId: string) => {
    try {
      const res = await fetch(`/api/vendor/markets/${marketId}`, { method: 'DELETE' })
      if (res.ok) {
        await fetchMarkets()
      } else {
        const errData = await res.json()
        setError({
          error: errData.error || 'Failed to delete market',
          code: errData.code, traceId: errData.traceId, details: errData.details
        })
      }
    } catch (err) {
      console.error('Error deleting market:', err)
      setError({ error: 'Failed to delete market' })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const validWindows = formData.pickup_windows.filter(w => w.day_of_week !== '' && w.start_time && w.end_time)
    if (validWindows.length === 0) {
      setError({ error: 'At least one pickup window is required' })
      setSubmitting(false)
      return
    }

    const latitude = formData.latitude ? parseFloat(formData.latitude) : null
    const longitude = formData.longitude ? parseFloat(formData.longitude) : null

    if (formData.latitude && formData.longitude) {
      if (isNaN(latitude!) || isNaN(longitude!)) {
        setError({ error: 'Please enter valid numeric values for Latitude and Longitude.' })
        setSubmitting(false)
        return
      }
      if (latitude! < -90 || latitude! > 90 || longitude! < -180 || longitude! > 180) {
        setError({ error: 'Invalid coordinates. Latitude must be between -90 and 90, Longitude between -180 and 180.' })
        setSubmitting(false)
        return
      }
    }

    try {
      if (editingMarket) {
        const res = await fetch(`/api/vendor/markets/${editingMarket.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name, address: formData.address, city: formData.city,
            state: formData.state, zip: formData.zip, latitude, longitude,
            season_start: formData.season_start || null, season_end: formData.season_end || null,
            expires_at: formData.expires_at || null, pickup_windows: validWindows
          })
        })
        if (res.ok) { await fetchMarkets(); resetForm() }
        else {
          const errData = await res.json()
          setError({ error: errData.error || 'Failed to update market', code: errData.code, traceId: errData.traceId, details: errData.details })
        }
      } else {
        const res = await fetch('/api/vendor/markets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vertical, name: formData.name, address: formData.address, city: formData.city,
            state: formData.state, zip: formData.zip, latitude, longitude,
            season_start: formData.season_start || null, season_end: formData.season_end || null,
            expires_at: formData.expires_at || null, pickup_windows: validWindows
          })
        })
        if (res.ok) { await fetchMarkets(); resetForm() }
        else {
          const errData = await res.json()
          setError({ error: errData.error || 'Failed to create market', code: errData.code, traceId: errData.traceId, details: errData.details })
        }
      }
    } catch (err) {
      console.error('Error saving market:', err)
      setError({ error: 'Failed to save market' })
    } finally {
      setSubmitting(false)
    }
  }

  const defaultCutoff = getDefaultCutoffHours(vertical, 'private_pickup')

  return (
    <>
      <div style={{
        backgroundColor: 'white',
        borderRadius: 8,
        border: `1px solid ${statusColors.neutral200}`,
        padding: 24
      }}>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: '0 0 4px 0', fontSize: 20, fontWeight: 600 }}>
            {term(vertical, 'private_pickups')}
          </h2>
          <p style={{ margin: '0 0 8px 0', fontSize: 14, color: statusColors.neutral500 }}>
            {isFoodTruck
              ? 'Your own service locations with flexible scheduling.'
              : 'Your own pickup locations with flexible scheduling.'}
            {limits && ` (${limits.currentPrivatePickupCount} of ${limits.privatePickupLocations} used)`}
            {limits && !limits.canAddPrivatePickup && (
              <span style={{ color: statusColors.danger, marginLeft: 8 }}>
                Limit reached. <a href={`/${vertical}/settings`} style={{ color: statusColors.info }}>Upgrade</a> for more locations.
              </span>
            )}
          </p>
          {!showForm && limits?.canAddPrivatePickup && (
            <button onClick={() => setShowForm(true)}
              style={{ padding: '6px 14px', backgroundColor: 'transparent', color: colors.primary, border: `2px solid ${colors.primary}`, borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Add {term(vertical, 'private_pickup')}
            </button>
          )}
          {!showForm && limits && !limits.canAddPrivatePickup && (
            <button disabled
              style={{ padding: '6px 14px', backgroundColor: statusColors.neutral400, color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'not-allowed' }}
              title="Upgrade to add more pickup locations">
              Add {term(vertical, 'private_pickup')} (Limit Reached)
            </button>
          )}
        </div>

        {/* Auto-Cutoff Notice */}
        {defaultCutoff > 0 && (
          <div style={{ padding: 16, backgroundColor: statusColors.dangerLight, border: `1px solid ${statusColors.dangerBorder}`, borderRadius: 8, marginBottom: 20 }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: statusColors.dangerDark }}>
              {'⚠️'} Notice: Automatic Order Cutoff
            </h4>
            <p style={{ margin: 0, fontSize: 13, color: statusColors.dangerDark, lineHeight: 1.5 }}>
              All pre-order sales automatically close <strong>{defaultCutoff} hours before your pickup time</strong>. This gives you time to prepare orders and know exactly what to bring. When you set your pickup day and time below, your cutoff time will be calculated automatically.
            </p>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSubmit} style={{ padding: 20, border: `1px solid ${statusColors.neutral200}`, borderRadius: 8, backgroundColor: statusColors.neutral50, marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600 }}>
              {editingMarket ? 'Edit Pickup Location' : 'New Pickup Location'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Location Name *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={isFoodTruck ? 'e.g., Downtown Lunch Spot' : 'e.g., My Farm Stand'}
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Address *</label>
                <input type="text" required value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Street address"
                  style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>City *</label>
                  <input type="text" required value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>State *</label>
                  <input type="text" required value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    maxLength={2} placeholder="TX"
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>ZIP *</label>
                  <input type="text" required value={formData.zip} onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                    maxLength={10}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Coordinates Info Notice */}
              <div style={{ padding: '10px 14px', backgroundColor: statusColors.infoLight, border: `1px solid ${statusColors.infoBorder}`, borderRadius: 8, marginTop: 12 }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600, color: statusColors.infoDark }}>
                  {'📍'} Improve Your Visibility with Coordinates
                </h4>
                <p style={{ margin: 0, fontSize: 13, color: statusColors.infoDark, lineHeight: 1.5 }}>
                  Adding coordinates helps buyers find your pickup location more accurately. Without coordinates, buyers near the edge of the 25-mile radius may not see you. Get coordinates from <a href="https://www.latlong.net/" target="_blank" rel="noopener noreferrer" style={{ color: statusColors.info, fontWeight: 500 }}>latlong.net</a>.
                </p>
              </div>

              {/* Latitude/Longitude */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                    Latitude <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(recommended)</span>
                  </label>
                  <input type="text" value={formData.latitude} onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    placeholder="e.g., 35.1992"
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                    Longitude <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(recommended)</span>
                  </label>
                  <input type="text" value={formData.longitude} onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    placeholder="e.g., -101.8451"
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Season Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                    Season Start <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(optional)</span>
                  </label>
                  <input type="date" value={formData.season_start} onChange={(e) => setFormData({ ...formData, season_start: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
                  <p style={{ margin: '4px 0 0 0', fontSize: 12, color: statusColors.neutral500 }}>When does this location open for the season?</p>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                    Season End <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(optional)</span>
                  </label>
                  <input type="date" value={formData.season_end} onChange={(e) => setFormData({ ...formData, season_end: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
                  <p style={{ margin: '4px 0 0 0', fontSize: 12, color: statusColors.neutral500 }}>When does this location close for the season?</p>
                </div>
              </div>
              <p style={{ margin: '4px 0 12px 0', fontSize: 13, color: statusColors.neutral500, fontStyle: 'italic' }}>Leave blank if open year-round.</p>

              {/* Expiration Date */}
              <div style={{ padding: '10px 14px', backgroundColor: statusColors.warningLight, border: `1px solid ${statusColors.warningBorder}`, borderRadius: 8, marginTop: 12 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 4, color: statusColors.warningDark }}>
                  {'📅'} Expiration Date <span style={{ fontWeight: 400 }}>(optional)</span>
                </label>
                <p style={{ margin: '0 0 8px 0', fontSize: 13, color: statusColors.warningDark }}>
                  For one-time events or temporary locations. After this date, the location will no longer be visible to buyers.
                </p>
                <input type="date" value={formData.expires_at} onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  style={{ width: '100%', maxWidth: 200, padding: '8px 10px', border: `1px solid ${statusColors.warningBorder}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box', backgroundColor: 'white' }}
                />
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: statusColors.warningDark }}>Leave blank for recurring/permanent locations.</p>
              </div>

              {/* Pickup Windows */}
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 14, fontWeight: 500 }}>
                    Pickup Windows * <span style={{ fontWeight: 400, color: statusColors.neutral500 }}>(max {maxPickupWindows} per week)</span>
                  </label>
                  {formData.pickup_windows.length < maxPickupWindows && (
                    <button type="button" onClick={addPickupWindow}
                      style={{ padding: '4px 12px', backgroundColor: statusColors.infoLight, color: statusColors.infoDark, border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                      + Add Another Window
                    </button>
                  )}
                </div>

                {formData.pickup_windows.map((window, index) => (
                  <div key={index} style={{ padding: 12, border: `1px solid ${statusColors.neutral300}`, borderRadius: 6, backgroundColor: 'white', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 120px', minWidth: 120 }}>
                        <label style={{ display: 'block', fontSize: 12, color: statusColors.neutral500, marginBottom: 4 }}>Day</label>
                        <select value={window.day_of_week} onChange={(e) => updatePickupWindow(index, 'day_of_week', e.target.value)} required
                          style={{ width: '100%', padding: '8px 10px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }}>
                          <option value="">Select day...</option>
                          {DAYS.map((day, i) => (<option key={day} value={i}>{day}</option>))}
                        </select>
                      </div>
                      <div style={{ flex: '0 0 100px' }}>
                        <label style={{ display: 'block', fontSize: 12, color: statusColors.neutral500, marginBottom: 4 }}>Start Time</label>
                        <input type="time" value={window.start_time} onChange={(e) => updatePickupWindow(index, 'start_time', e.target.value)} required
                          style={{ width: '100%', padding: '8px 10px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ flex: '0 0 100px' }}>
                        <label style={{ display: 'block', fontSize: 12, color: statusColors.neutral500, marginBottom: 4 }}>End Time</label>
                        <input type="time" value={window.end_time} onChange={(e) => updatePickupWindow(index, 'end_time', e.target.value)} required
                          style={{ width: '100%', padding: '8px 10px', border: `1px solid ${statusColors.neutral300}`, borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }} />
                      </div>
                      {formData.pickup_windows.length > 1 && (
                        <button type="button" onClick={() => removePickupWindow(index)}
                          style={{ padding: '8px', backgroundColor: statusColors.dangerLight, color: statusColors.dangerDark, border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer', alignSelf: 'flex-end' }}>
                          ✕
                        </button>
                      )}
                    </div>
                    {window.day_of_week !== '' && window.start_time && (() => {
                      const display = getCutoffDisplay(parseInt(window.day_of_week), window.start_time, defaultCutoff)
                      return display ? (
                        <div style={{ marginTop: 8, padding: '6px 10px', backgroundColor: statusColors.warningLight, borderRadius: 4, fontSize: 12, color: statusColors.warningDark }}>
                          <strong>Cutoff:</strong> {display}
                        </div>
                      ) : null
                    })()}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button type="submit" disabled={submitting}
                style={{ padding: '10px 20px', backgroundColor: submitting ? statusColors.neutral400 : colors.primary, color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}>
                {submitting ? 'Saving...' : (editingMarket ? 'Update' : 'Create')}
              </button>
              <button type="button" onClick={resetForm}
                style={{ padding: '10px 20px', backgroundColor: statusColors.neutral200, color: statusColors.neutral700, border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Private Pickup Markets List */}
        {privatePickupMarkets.length === 0 ? (
          <p style={{ color: statusColors.neutral400, fontStyle: 'italic', margin: 0 }}>
            No pickup locations yet. Create one above!
          </p>
        ) : (() => {
          const expandedPickups = privatePickupMarkets.filter(m => expandedPickupIds.has(m.id))
          const collapsedPickups = privatePickupMarkets.filter(m => !expandedPickupIds.has(m.id))
          return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {expandedPickups.map(market => (
              <div key={market.id} style={{ padding: 12, border: `1px solid ${statusColors.neutral200}`, borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{market.name}</h3>
                  <button onClick={() => setExpandedPickupIds(prev => { const next = new Set(prev); next.delete(market.id); return next })}
                    style={{ padding: '2px 8px', backgroundColor: 'transparent', color: statusColors.neutral400, border: `1px solid ${statusColors.neutral300}`, borderRadius: 4, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                    Collapse
                  </button>
                </div>

                {market.expires_at && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                    backgroundColor: new Date(market.expires_at) < new Date() ? statusColors.dangerLight : statusColors.warningLight,
                    color: new Date(market.expires_at) < new Date() ? statusColors.dangerDark : statusColors.warningDark,
                    borderRadius: 4, fontSize: 11, fontWeight: 500, marginBottom: 4
                  }}>
                    {new Date(market.expires_at) < new Date() ? '⚠️ Expired' : `📅 Expires ${new Date(market.expires_at).toLocaleDateString()}`}
                  </span>
                )}

                <p style={{ margin: '0 0 4px 0', fontSize: 13, color: statusColors.neutral500 }}>
                  {market.address}, {market.city}, {market.state} {market.zip}
                </p>

                {market.schedules && market.schedules.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {market.schedules.map((schedule, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '6px 10px', backgroundColor: statusColors.neutral100, borderRadius: 6, marginBottom: 4, fontSize: 13 }}>
                        <div style={{ flex: 1 }}>
                          <strong>{DAYS[schedule.day_of_week]}</strong>{' '}
                          {formatTime12h(schedule.start_time)} - {formatTime12h(schedule.end_time)}
                        </div>
                        {(() => {
                          const cutoffHrs = market.cutoff_hours ?? defaultCutoff
                          const display = getCutoffDisplay(schedule.day_of_week, schedule.start_time, cutoffHrs)
                          return display ? (
                            <div style={{ padding: '3px 6px', backgroundColor: statusColors.warningLight, borderRadius: 4, fontSize: 11, color: statusColors.warningDark }}>
                              Cutoff: {display}
                            </div>
                          ) : null
                        })()}
                      </div>
                    ))}
                  </div>
                )}

                {(!market.schedules || market.schedules.length === 0) && (
                  <div style={{ marginTop: 4, padding: '6px 10px', backgroundColor: statusColors.dangerLight, border: `1px solid ${statusColors.dangerBorder}`, borderRadius: 6, fontSize: 12, color: statusColors.dangerDark }}>
                    No pickup schedule set. Edit to add pickup times.
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  <button onClick={() => handleEdit(market)}
                    style={{ padding: '6px 12px', backgroundColor: statusColors.info, color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Edit
                  </button>
                  <button onClick={() => router.push(`/${vertical}/vendor/listings?market=${market.id}`)}
                    style={{ padding: '6px 12px', backgroundColor: statusColors.info, color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Manage Listings
                  </button>
                  <button onClick={() => setDeleteConfirmId(market.id)}
                    style={{ padding: '6px 12px', backgroundColor: statusColors.danger, color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {collapsedPickups.length > 0 && (
              <div style={{ border: `1px solid ${statusColors.neutral200}`, borderRadius: 8, overflow: 'hidden' }}>
                {collapsedPickups.map((market, idx) => (
                  <div key={market.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      borderBottom: idx < collapsedPickups.length - 1 ? `1px solid ${statusColors.neutral100}` : 'none',
                      cursor: 'pointer', backgroundColor: 'white'
                    }}
                    onClick={() => setExpandedPickupIds(prev => { const next = new Set(prev); next.add(market.id); return next })}
                  >
                    <input type="checkbox" checked={false}
                      onChange={() => setExpandedPickupIds(prev => { const next = new Set(prev); next.add(market.id); return next })}
                      style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{market.name}</span>
                      <span style={{ fontSize: 12, color: statusColors.neutral400, marginLeft: 8 }}>{market.city}, {market.state}</span>
                    </div>
                    {market.schedules && market.schedules.length > 0 && (
                      <span style={{ fontSize: 11, color: statusColors.neutral500, flexShrink: 0 }}>
                        {market.schedules.map(s => DAYS[s.day_of_week].slice(0, 3)).join(', ')}
                      </span>
                    )}
                    {market.expires_at && new Date(market.expires_at) < new Date() && (
                      <span style={{ fontSize: 11, color: statusColors.danger, fontWeight: 600, flexShrink: 0 }}>Expired</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          )
        })()}
      </div>

      <ConfirmDialog
        open={!!deleteConfirmId}
        title="Delete Pickup Location"
        message="Are you sure you want to delete this pickup location? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteConfirmId) handleDelete(deleteConfirmId)
          setDeleteConfirmId(null)
        }}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </>
  )
}
