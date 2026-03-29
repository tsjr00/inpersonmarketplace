'use client'

import { useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface EventReadinessData {
  vehicle_type: string
  vehicle_length_feet: number
  requires_generator: boolean
  generator_type?: string
  generator_fuel?: string
  max_runtime_hours: number
  strong_odors: boolean
  odor_description?: string
  food_perishability: string
  packaging: string
  utensils_required: boolean
  seating_recommended: boolean
  max_headcount_per_wave: number
  has_event_experience: boolean
  event_experience_description?: string
  additional_notes?: string
  application_status?: string
  submitted_at?: string
  updated_at?: string
}

interface EventReadinessFormProps {
  vendorId: string
  vertical: string
  initialData: Record<string, unknown> | null
  eventApproved: boolean
}

const STATUS_BADGES: Record<string, { label: string; bg: string; color: string }> = {
  pending_review: { label: 'Application Pending', bg: '#fef3c7', color: '#92400e' },
  approved: { label: 'Event Approved', bg: '#d1fae5', color: '#065f46' },
  rejected: { label: 'Not Approved', bg: '#fef2f2', color: '#991b1b' },
}

const inputStyle = {
  width: '100%',
  padding: spacing.xs,
  borderRadius: radius.sm,
  border: `1px solid ${colors.border}`,
  fontSize: typography.sizes.base,
  minHeight: 38,
  boxSizing: 'border-box' as const,
}

const labelStyle = {
  display: 'block' as const,
  marginBottom: spacing['2xs'],
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.medium,
  color: colors.textPrimary,
}

const hintStyle = {
  margin: `${spacing['3xs']} 0 0 0`,
  fontSize: typography.sizes.xs,
  color: colors.textMuted,
}

export default function EventReadinessForm({
  vertical,
  initialData,
  eventApproved,
}: EventReadinessFormProps) {
  const d = initialData as Partial<EventReadinessData> | null
  const [form, setForm] = useState<EventReadinessData>({
    vehicle_type: d?.vehicle_type || '',
    vehicle_length_feet: d?.vehicle_length_feet || 0,
    requires_generator: d?.requires_generator ?? false,
    generator_type: d?.generator_type || '',
    generator_fuel: d?.generator_fuel || '',
    max_runtime_hours: d?.max_runtime_hours || 0,
    strong_odors: d?.strong_odors ?? false,
    odor_description: d?.odor_description || '',
    food_perishability: d?.food_perishability || '',
    packaging: d?.packaging || '',
    utensils_required: d?.utensils_required ?? false,
    seating_recommended: d?.seating_recommended ?? false,
    max_headcount_per_wave: d?.max_headcount_per_wave || 0,
    has_event_experience: d?.has_event_experience ?? false,
    event_experience_description: d?.event_experience_description || '',
    additional_notes: d?.additional_notes || '',
    application_status: d?.application_status || 'not_applied',
  })

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const applicationStatus = form.application_status || 'not_applied'
  const hasApplied = applicationStatus !== 'not_applied'
  const statusBadge = STATUS_BADGES[applicationStatus]

  const updateField = <K extends keyof EventReadinessData>(key: K, value: EventReadinessData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch(`/api/vendor/event-readiness?vertical=${vertical}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_type: form.vehicle_type,
          vehicle_length_feet: Number(form.vehicle_length_feet),
          requires_generator: form.requires_generator,
          ...(form.requires_generator ? {
            generator_type: form.generator_type,
            generator_fuel: form.generator_fuel,
          } : {}),
          max_runtime_hours: Number(form.max_runtime_hours),
          strong_odors: form.strong_odors,
          ...(form.strong_odors ? { odor_description: form.odor_description } : {}),
          food_perishability: form.food_perishability,
          packaging: form.packaging,
          utensils_required: form.utensils_required,
          seating_recommended: form.seating_recommended,
          max_headcount_per_wave: Number(form.max_headcount_per_wave),
          has_event_experience: form.has_event_experience,
          ...(form.has_event_experience ? { event_experience_description: form.event_experience_description } : {}),
          additional_notes: form.additional_notes,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        if (data.application_status) {
          updateField('application_status', data.application_status)
        }
        setMessage({
          type: 'success',
          text: hasApplied
            ? 'Event readiness information updated!'
            : 'Application submitted! Our team will review your event readiness profile.',
        })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save event readiness information' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      padding: spacing.md,
      border: `1px solid ${colors.border}`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
        <h2 style={{
          margin: 0,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
        }}>
          Private Events Readiness
        </h2>
        {statusBadge && (
          <span style={{
            padding: `${spacing['3xs']} ${spacing.xs}`,
            backgroundColor: statusBadge.bg,
            color: statusBadge.color,
            borderRadius: radius.sm,
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.semibold,
          }}>
            {statusBadge.label}
          </span>
        )}
      </div>
      <p style={{
        margin: `${spacing['2xs']} 0 ${spacing.md} 0`,
        fontSize: typography.sizes.sm,
        color: colors.textSecondary,
      }}>
        {vertical === 'food_trucks'
          ? 'Want to serve at corporate events, sports tournaments, and private gatherings? Fill out this questionnaire so our team can match you with the right events.'
          : 'Want to sell at community events, corporate wellness fairs, and private gatherings? Fill out this questionnaire so our team can match you with the right events.'}
      </p>

      {/* Event Approved Banner */}
      {eventApproved && (
        <div style={{
          padding: spacing.sm,
          marginBottom: spacing.md,
          borderRadius: radius.sm,
          backgroundColor: '#d1fae5',
          color: '#065f46',
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.medium,
        }}>
          You are approved for private events! You can update your information below at any time.
        </div>
      )}

      {/* ── Vehicle & Setup — FT only ── */}
      {vertical === 'food_trucks' && (<>
        <h3 style={{
          margin: `0 0 ${spacing.sm} 0`,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
          borderBottom: `1px solid ${colors.border}`,
          paddingBottom: spacing['2xs'],
        }}>
          Vehicle & Setup
        </h3>

        {/* 1. Vehicle Type */}
        <div style={{ marginBottom: spacing.sm }}>
          <label style={labelStyle}>Vehicle Type *</label>
          <select
            value={form.vehicle_type}
            onChange={(e) => updateField('vehicle_type', e.target.value)}
            style={inputStyle}
          >
            <option value="">Select...</option>
            <option value="food_truck">Food Truck</option>
            <option value="food_trailer">Food Trailer (truck + trailer)</option>
          </select>
        </div>

        {/* 2. Vehicle Length */}
        <div style={{ marginBottom: spacing.sm }}>
          <label style={labelStyle}>Vehicle Length (feet) *</label>
          <input
            type="number"
            min={5}
            max={80}
            value={form.vehicle_length_feet || ''}
            onChange={(e) => updateField('vehicle_length_feet', Number(e.target.value))}
            placeholder="e.g., 24"
            style={inputStyle}
          />
          {form.vehicle_type === 'food_trailer' && (
            <p style={hintStyle}>Combined length of truck + trailer</p>
          )}
        </div>

        {/* 3. Requires Generator */}
        <div style={{ marginBottom: spacing.sm }}>
          <label style={labelStyle}>Requires Generator? *</label>
          <div style={{ display: 'flex', gap: spacing.md }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], cursor: 'pointer', fontSize: typography.sizes.base }}>
              <input
                type="radio"
                name="requires_generator"
                checked={form.requires_generator === true}
                onChange={() => updateField('requires_generator', true)}
                style={{ width: 18, height: 18 }}
              />
              Yes
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], cursor: 'pointer', fontSize: typography.sizes.base }}>
              <input
                type="radio"
                name="requires_generator"
                checked={form.requires_generator === false}
                onChange={() => updateField('requires_generator', false)}
                style={{ width: 18, height: 18 }}
              />
              No
            </label>
          </div>
        </div>

        {/* 4. Generator Type (conditional) */}
        {form.requires_generator && (
          <div style={{ marginBottom: spacing.sm }}>
            <label style={labelStyle}>Generator Type *</label>
            <select
              value={form.generator_type || ''}
              onChange={(e) => updateField('generator_type', e.target.value)}
              style={inputStyle}
            >
              <option value="">Select...</option>
              <option value="quiet_inverter">Quiet / Inverter Generator</option>
              <option value="standard">Standard Generator</option>
            </select>
            <p style={hintStyle}>Many venues require quiet generators for noise restrictions</p>
          </div>
        )}

        {/* 5. Generator Fuel (conditional) */}
        {form.requires_generator && (
          <div style={{ marginBottom: spacing.sm }}>
            <label style={labelStyle}>Generator Fuel *</label>
            <select
              value={form.generator_fuel || ''}
              onChange={(e) => updateField('generator_fuel', e.target.value)}
              style={inputStyle}
            >
              <option value="">Select...</option>
              <option value="propane">Propane (minimal smell)</option>
              <option value="gasoline">Gasoline</option>
              <option value="diesel">Diesel</option>
            </select>
          </div>
        )}

        {/* 6. Max Runtime */}
        <div style={{ marginBottom: spacing.md }}>
          <label style={labelStyle}>Max Runtime Without External Power (hours) *</label>
          <input
            type="number"
            min={1}
            max={24}
            value={form.max_runtime_hours || ''}
            onChange={(e) => updateField('max_runtime_hours', Number(e.target.value))}
            placeholder="e.g., 8"
            style={inputStyle}
          />
        </div>
      </>)}

      {/* ── Booth Setup — FM only ── */}
      {vertical === 'farmers_market' && (<>
        <h3 style={{
          margin: `0 0 ${spacing.sm} 0`,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          color: colors.textPrimary,
          borderBottom: `1px solid ${colors.border}`,
          paddingBottom: spacing['2xs'],
        }}>
          Booth & Setup
        </h3>

        {/* FM: Setup type */}
        <div style={{ marginBottom: spacing.sm }}>
          <label style={labelStyle}>Setup Type *</label>
          <select
            value={form.vehicle_type}
            onChange={(e) => updateField('vehicle_type', e.target.value)}
            style={inputStyle}
          >
            <option value="">Select...</option>
            <option value="tent_booth">Tent / Booth</option>
            <option value="table_only">Table Only</option>
            <option value="trailer">Trailer</option>
            <option value="vehicle_booth">Vehicle + Booth</option>
          </select>
        </div>

        {/* FM: Space needed */}
        <div style={{ marginBottom: spacing.sm }}>
          <label style={labelStyle}>Space Needed (feet wide) *</label>
          <input
            type="number"
            min={4}
            max={40}
            value={form.vehicle_length_feet || ''}
            onChange={(e) => updateField('vehicle_length_feet', Number(e.target.value))}
            placeholder="e.g., 10"
            style={inputStyle}
          />
          <p style={hintStyle}>How much frontage space does your booth setup need?</p>
        </div>

        {/* FM: Power needed */}
        <div style={{ marginBottom: spacing.md }}>
          <label style={labelStyle}>Do You Need Access to Electrical Power? *</label>
          <div style={{ display: 'flex', gap: spacing.md }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], cursor: 'pointer', fontSize: typography.sizes.base }}>
              <input
                type="radio"
                name="requires_generator"
                checked={form.requires_generator === true}
                onChange={() => updateField('requires_generator', true)}
                style={{ width: 18, height: 18 }}
              />
              Yes
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], cursor: 'pointer', fontSize: typography.sizes.base }}>
              <input
                type="radio"
                name="requires_generator"
                checked={form.requires_generator === false}
                onChange={() => updateField('requires_generator', false)}
                style={{ width: 18, height: 18 }}
              />
              No
            </label>
          </div>
          <p style={hintStyle}>For refrigeration, lighting, or display equipment</p>
        </div>
      </>)}

      {/* ── Food / Product Characteristics ── */}
      <h3 style={{
        margin: `0 0 ${spacing.sm} 0`,
        fontSize: typography.sizes.base,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary,
        borderBottom: `1px solid ${colors.border}`,
        paddingBottom: spacing['2xs'],
      }}>
        {vertical === 'food_trucks' ? 'Food Service Characteristics' : 'Product Characteristics'}
      </h3>

      {/* 7. Strong Odors */}
      <div style={{ marginBottom: spacing.sm }}>
        <label style={labelStyle}>
          {vertical === 'food_trucks'
            ? 'Does Your Cooking Produce Strong Odors? *'
            : 'Does Your Setup Produce Strong Odors? (e.g., cooking demos, samples) *'}
        </label>
        <div style={{ display: 'flex', gap: spacing.md }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], cursor: 'pointer', fontSize: typography.sizes.base }}>
            <input
              type="radio"
              name="strong_odors"
              checked={form.strong_odors === true}
              onChange={() => updateField('strong_odors', true)}
              style={{ width: 18, height: 18 }}
            />
            Yes
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], cursor: 'pointer', fontSize: typography.sizes.base }}>
            <input
              type="radio"
              name="strong_odors"
              checked={form.strong_odors === false}
              onChange={() => updateField('strong_odors', false)}
              style={{ width: 18, height: 18 }}
            />
            No
          </label>
        </div>
      </div>

      {/* 7b. Odor Description (conditional) */}
      {form.strong_odors && (
        <div style={{ marginBottom: spacing.sm }}>
          <label style={labelStyle}>Describe the Odors *</label>
          <input
            type="text"
            value={form.odor_description || ''}
            onChange={(e) => updateField('odor_description', e.target.value)}
            placeholder="e.g., frying, grilling, smoking"
            style={inputStyle}
          />
        </div>
      )}

      {/* 8. Product Perishability / Storage */}
      <div style={{ marginBottom: spacing.sm }}>
        <label style={labelStyle}>
          {vertical === 'food_trucks' ? 'Food Perishability *' : 'Product Storage Needs *'}
        </label>
        <select
          value={form.food_perishability}
          onChange={(e) => updateField('food_perishability', e.target.value)}
          style={inputStyle}
        >
          <option value="">Select...</option>
          {vertical === 'food_trucks' ? (<>
            <option value="immediate">Must be eaten immediately (ice cream, frozen items)</option>
            <option value="within_15_min">Best within 15 minutes (fried items, hot plates)</option>
            <option value="can_sit_30_plus">Can sit 30+ minutes (tacos, sandwiches, packaged items)</option>
          </>) : (<>
            <option value="refrigerated">Requires refrigeration or ice (dairy, meat, produce)</option>
            <option value="shade_required">Needs shade / temperature control (chocolate, baked goods)</option>
            <option value="shelf_stable">Shelf-stable (jams, honey, crafts, dry goods)</option>
          </>)}
        </select>
      </div>

      {/* 9. Packaging / Display */}
      <div style={{ marginBottom: spacing.sm }}>
        <label style={labelStyle}>
          {vertical === 'food_trucks' ? 'Packaging Used for Serving *' : 'Product Display Setup *'}
        </label>
        <input
          type="text"
          value={form.packaging}
          onChange={(e) => updateField('packaging', e.target.value)}
          placeholder={vertical === 'food_trucks'
            ? 'e.g., boxes, wrappers, bowls, foil containers'
            : 'e.g., table displays, baskets, refrigerated cooler, shelving, signage'}
          style={inputStyle}
        />
      </div>

      {/* FT: Utensils + Seating | FM: Samples + Weather */}
      {vertical === 'food_trucks' ? (<>
        {/* 10. Utensils Required */}
        <div style={{ marginBottom: spacing.sm }}>
          <label style={labelStyle}>Does Your Food Require Utensils? *</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], cursor: 'pointer', fontSize: typography.sizes.sm }}>
              <input type="radio" name="utensils_required" checked={form.utensils_required === true} onChange={() => updateField('utensils_required', true)} style={{ width: 16, height: 16 }} />
              Yes (forks, knives, or spoons needed)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], cursor: 'pointer', fontSize: typography.sizes.sm }}>
              <input type="radio" name="utensils_required" checked={form.utensils_required === false} onChange={() => updateField('utensils_required', false)} style={{ width: 16, height: 16 }} />
              No (handheld)
            </label>
          </div>
        </div>

        {/* 11. Seating Recommended */}
        <div style={{ marginBottom: spacing.md }}>
          <label style={labelStyle}>Should Guests Have Seating? *</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], cursor: 'pointer', fontSize: typography.sizes.sm }}>
              <input type="radio" name="seating_recommended" checked={form.seating_recommended === true} onChange={() => updateField('seating_recommended', true)} style={{ width: 16, height: 16 }} />
              Yes (e.g., BBQ plates, full meals)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], cursor: 'pointer', fontSize: typography.sizes.sm }}>
              <input type="radio" name="seating_recommended" checked={form.seating_recommended === false} onChange={() => updateField('seating_recommended', false)} style={{ width: 16, height: 16 }} />
              No (handheld, walk-and-eat)
            </label>
          </div>
        </div>
      </>) : (<>
        {/* FM 10. Samples Available */}
        <div style={{ marginBottom: spacing.sm }}>
          <label style={labelStyle}>Can You Offer Product Samples at Events? *</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], cursor: 'pointer', fontSize: typography.sizes.sm }}>
              <input type="radio" name="utensils_required" checked={form.utensils_required === true} onChange={() => updateField('utensils_required', true)} style={{ width: 16, height: 16 }} />
              Yes — I can provide samples or tastings
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], cursor: 'pointer', fontSize: typography.sizes.sm }}>
              <input type="radio" name="utensils_required" checked={form.utensils_required === false} onChange={() => updateField('utensils_required', false)} style={{ width: 16, height: 16 }} />
              No — display and sell only
            </label>
          </div>
          <p style={hintStyle}>Event organizers love vendors who offer samples — it drives foot traffic to your booth</p>
        </div>

        {/* FM 11. Weather Sensitivity */}
        <div style={{ marginBottom: spacing.md }}>
          <label style={labelStyle}>Outdoor Event Suitability *</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], cursor: 'pointer', fontSize: typography.sizes.sm }}>
              <input type="radio" name="seating_recommended" checked={form.seating_recommended === false} onChange={() => updateField('seating_recommended', false)} style={{ width: 16, height: 16 }} />
              Fully outdoor OK — my products and setup handle sun, wind, and light rain
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], cursor: 'pointer', fontSize: typography.sizes.sm }}>
              <input type="radio" name="seating_recommended" checked={form.seating_recommended === true} onChange={() => updateField('seating_recommended', true)} style={{ width: 16, height: 16 }} />
              Needs covered / indoor space — products are weather-sensitive
            </label>
          </div>
        </div>
      </>)}

      {/* ── Capacity & Experience ── */}
      <h3 style={{
        margin: `0 0 ${spacing.sm} 0`,
        fontSize: typography.sizes.base,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary,
        borderBottom: `1px solid ${colors.border}`,
        paddingBottom: spacing['2xs'],
      }}>
        Capacity & Experience
      </h3>

      {/* 12. Capacity */}
      <div style={{ marginBottom: spacing.sm }}>
        <label style={labelStyle}>
          {vertical === 'food_trucks'
            ? 'Max Headcount Per 30-Minute Wave *'
            : 'How Many Customers Can You Serve Per Hour? *'}
        </label>
        <input
          type="number"
          min={5}
          max={500}
          value={form.max_headcount_per_wave || ''}
          onChange={(e) => updateField('max_headcount_per_wave', Number(e.target.value))}
          placeholder={vertical === 'food_trucks' ? 'e.g., 50' : 'e.g., 30'}
          style={inputStyle}
        />
        <p style={hintStyle}>
          {vertical === 'food_trucks'
            ? 'Events use staggered waves — how many people can you serve in a 30-minute window?'
            : 'Consider checkout speed, product restocking, and customer interaction time'}
        </p>
      </div>

      {/* 13. Event Experience */}
      <div style={{ marginBottom: spacing.sm }}>
        <label style={labelStyle}>Do You Have Event or Catering Experience? *</label>
        <div style={{ display: 'flex', gap: spacing.md }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], cursor: 'pointer', fontSize: typography.sizes.base }}>
            <input
              type="radio"
              name="has_event_experience"
              checked={form.has_event_experience === true}
              onChange={() => updateField('has_event_experience', true)}
              style={{ width: 18, height: 18 }}
            />
            Yes
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], cursor: 'pointer', fontSize: typography.sizes.base }}>
            <input
              type="radio"
              name="has_event_experience"
              checked={form.has_event_experience === false}
              onChange={() => updateField('has_event_experience', false)}
              style={{ width: 18, height: 18 }}
            />
            No
          </label>
        </div>
      </div>

      {/* 13b. Experience Description (conditional) */}
      {form.has_event_experience && (
        <div style={{ marginBottom: spacing.sm }}>
          <label style={labelStyle}>Describe Your Experience *</label>
          <textarea
            value={form.event_experience_description || ''}
            onChange={(e) => updateField('event_experience_description', e.target.value)}
            placeholder={vertical === 'food_trucks'
              ? 'e.g., corporate events, festivals, sports tournaments, wedding catering...'
              : 'e.g., holiday markets, community festivals, pop-up shops, corporate wellness fairs...'}
            rows={3}
            style={{
              ...inputStyle,
              minHeight: 80,
              resize: 'vertical' as const,
            }}
          />
        </div>
      )}

      {/* ── Additional ── */}
      <h3 style={{
        margin: `0 0 ${spacing.sm} 0`,
        fontSize: typography.sizes.base,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary,
        borderBottom: `1px solid ${colors.border}`,
        paddingBottom: spacing['2xs'],
      }}>
        Additional Information
      </h3>

      {/* 14. Additional Notes */}
      <div style={{ marginBottom: spacing.md }}>
        <label style={labelStyle}>Anything Else About Your Event Capabilities?</label>
        <textarea
          value={form.additional_notes || ''}
          onChange={(e) => updateField('additional_notes', e.target.value)}
          placeholder="Special equipment, services, setup requirements, etc."
          rows={3}
          style={{
            ...inputStyle,
            minHeight: 80,
            resize: 'vertical' as const,
          }}
        />
      </div>

      {/* Message — shown near submit button where user is looking */}
      {message && (
        <div style={{
          padding: spacing.sm,
          marginBottom: spacing.xs,
          borderRadius: radius.sm,
          backgroundColor: message.type === 'success' ? colors.primaryLight : '#fef2f2',
          color: message.type === 'success' ? colors.primaryDark : '#991b1b',
          fontSize: typography.sizes.sm,
        }}>
          {message.text}
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={saving}
        style={{
          width: '100%',
          padding: spacing.xs,
          backgroundColor: saving ? colors.borderMuted : colors.primary,
          color: colors.textInverse,
          border: 'none',
          borderRadius: radius.sm,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          cursor: saving ? 'not-allowed' : 'pointer',
          minHeight: 44,
        }}
      >
        {saving
          ? 'Saving...'
          : hasApplied
            ? 'Update Information'
            : 'Submit Application'
        }
      </button>
    </div>
  )
}
