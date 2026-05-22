'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

/**
 * Public intake form for the Market Manager Program landing page.
 *
 * Captures the minimum needed to create a `markets` row in 'pending'
 * status and email the applicant a setup link. The applicant continues
 * onboarding (booth inventory, opt-in statements, branding, Stripe)
 * inside the manager dashboard.
 *
 * Backend: POST /api/market-manager/intake. Mirrors the event-request
 * form's submission pattern + state machine.
 */

const US_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
]

type FormState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; marketName: string; message: string }
  | { kind: 'error'; message: string; field?: string }

const NOTES_MAX = 1000

export default function ManagerIntakeForm() {
  const params = useParams()
  const vertical = (params?.vertical as string) || 'farmers_market'

  const [managerName, setManagerName] = useState('')
  const [email, setEmail] = useState('')
  const [marketName, setMarketName] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [formState, setFormState] = useState<FormState>({ kind: 'idle' })

  const submitting = formState.kind === 'submitting'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    // Client-side required-field check — keeps the UX snappy. Server
    // re-validates everything.
    const trimmedName = managerName.trim()
    const trimmedEmail = email.trim()
    const trimmedMarket = marketName.trim()
    const trimmedCity = city.trim()
    const trimmedState = state.trim()

    if (!trimmedName) {
      setFormState({ kind: 'error', message: 'Your name is required', field: 'manager_name' })
      return
    }
    if (!trimmedEmail) {
      setFormState({ kind: 'error', message: 'Email is required', field: 'email' })
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFormState({ kind: 'error', message: 'Enter a valid email address', field: 'email' })
      return
    }
    if (!trimmedMarket) {
      setFormState({ kind: 'error', message: 'Market name is required', field: 'market_name' })
      return
    }
    if (!trimmedCity) {
      setFormState({ kind: 'error', message: 'City is required', field: 'city' })
      return
    }
    if (!trimmedState) {
      setFormState({ kind: 'error', message: 'State is required', field: 'state' })
      return
    }

    setFormState({ kind: 'submitting' })

    try {
      const res = await fetch(`/api/market-manager/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manager_name: trimmedName,
          email: trimmedEmail,
          market_name: trimmedMarket,
          city: trimmedCity,
          state: trimmedState,
          phone: phone.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setFormState({
          kind: 'error',
          message: data.error || 'Something went wrong. Please try again.',
          ...(data.field ? { field: data.field } : {}),
        })
        return
      }

      setFormState({
        kind: 'success',
        marketName: trimmedMarket,
        message: data.message || 'Thanks — check your email for next steps.',
      })
    } catch {
      setFormState({
        kind: 'error',
        message: 'Network error. Please try again.',
      })
    }
  }

  // ── Success state ─────────────────────────────────────────────────
  if (formState.kind === 'success') {
    return (
      <div style={{
        padding: spacing.lg,
        backgroundColor: '#d4edda',
        border: '1px solid #c3e6cb',
        borderRadius: radius.md,
        color: '#155724',
      }}>
        <h3 style={{
          margin: 0,
          marginBottom: spacing.sm,
          fontSize: typography.sizes.lg,
          fontWeight: typography.weights.semibold,
        }}>
          ✓ {formState.marketName} is registered
        </h3>
        <p style={{ margin: 0, marginBottom: spacing.sm, lineHeight: 1.6, fontSize: typography.sizes.base }}>
          {formState.message}
        </p>
        <p style={{ margin: 0, fontSize: typography.sizes.sm, lineHeight: 1.5 }}>
          The email comes from <strong>updates@mail.farmersmarketing.app</strong> — check your spam folder if you don&apos;t see it within a couple minutes.
        </p>
        <p style={{ margin: `${spacing.md} 0 0 0`, fontSize: typography.sizes.sm }}>
          Already have an account?{' '}
          <Link
            href={`/${vertical}/login`}
            style={{ color: '#0d4218', textDecoration: 'underline', fontWeight: typography.weights.semibold }}
          >
            Sign in here
          </Link>
          .
        </p>
      </div>
    )
  }

  // ── Form state (idle / submitting / error) ────────────────────────
  const errorField = formState.kind === 'error' ? formState.field : undefined
  const errorMessage = formState.kind === 'error' ? formState.message : null

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: spacing.lg,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
      }}
    >
      {/* Name + Email row */}
      <div style={fieldRowStyle}>
        <FieldWrapper label="Your name" required errored={errorField === 'manager_name'}>
          <input
            type="text"
            value={managerName}
            onChange={(e) => setManagerName(e.target.value)}
            disabled={submitting}
            maxLength={100}
            autoComplete="name"
            placeholder="Jane Doe"
            style={inputStyle(errorField === 'manager_name')}
          />
        </FieldWrapper>
        <FieldWrapper label="Email" required errored={errorField === 'email'}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            maxLength={200}
            autoComplete="email"
            placeholder="jane@yourmarket.com"
            style={inputStyle(errorField === 'email')}
          />
        </FieldWrapper>
      </div>

      {/* Market name + City row */}
      <div style={fieldRowStyle}>
        <FieldWrapper label="Market name" required errored={errorField === 'market_name'}>
          <input
            type="text"
            value={marketName}
            onChange={(e) => setMarketName(e.target.value)}
            disabled={submitting}
            maxLength={100}
            autoComplete="organization"
            placeholder="Westgate Farmers Market"
            style={inputStyle(errorField === 'market_name')}
          />
        </FieldWrapper>
        <FieldWrapper label="City" required errored={errorField === 'city'}>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={submitting}
            maxLength={100}
            autoComplete="address-level2"
            placeholder="Amarillo"
            style={inputStyle(errorField === 'city')}
          />
        </FieldWrapper>
      </div>

      {/* State + Phone row */}
      <div style={fieldRowStyle}>
        <FieldWrapper label="State" required errored={errorField === 'state'}>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            disabled={submitting}
            style={{ ...inputStyle(errorField === 'state'), backgroundColor: 'white' }}
          >
            <option value="">— Select —</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </FieldWrapper>
        <FieldWrapper label="Phone (optional)" errored={false}>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={submitting}
            maxLength={30}
            autoComplete="tel"
            placeholder="(555) 123-4567"
            style={inputStyle(false)}
          />
        </FieldWrapper>
      </div>

      {/* Notes — full width */}
      <FieldWrapper label="Anything we should know? (optional)" errored={false}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting}
          maxLength={NOTES_MAX}
          rows={3}
          placeholder="Tell us about your market — how many vendors, when you operate, anything you want us to keep in mind."
          style={{
            ...inputStyle(false),
            resize: 'vertical',
            fontFamily: 'inherit',
            minHeight: 80,
          }}
        />
        <div style={{
          textAlign: 'right',
          fontSize: typography.sizes.xs,
          color: colors.textMuted,
          marginTop: 2,
        }}>
          {notes.length}/{NOTES_MAX}
        </div>
      </FieldWrapper>

      {errorMessage && (
        <div style={{
          padding: spacing.sm,
          marginBottom: spacing.sm,
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
        }}>
          {errorMessage}
        </div>
      )}

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
        flexWrap: 'wrap',
        marginTop: spacing.sm,
      }}>
        <p style={{
          margin: 0,
          fontSize: typography.sizes.xs,
          color: colors.textMuted,
          lineHeight: 1.5,
          maxWidth: 400,
        }}>
          We use your email to send your dashboard invite. No marketing emails.
        </p>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: `${spacing.sm} ${spacing.lg}`,
            backgroundColor: colors.primary,
            color: 'white',
            border: 'none',
            borderRadius: radius.md,
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.semibold,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.6 : 1,
            minWidth: 160,
          }}
        >
          {submitting ? 'Submitting…' : 'Get started →'}
        </button>
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Subcomponents + styles
// ─────────────────────────────────────────────────────────────────────

function FieldWrapper({
  label,
  required,
  errored,
  children,
}: {
  label: string
  required?: boolean
  errored: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ flex: '1 1 220px', marginBottom: spacing.sm }}>
      <label style={{
        display: 'block',
        fontSize: typography.sizes.sm,
        fontWeight: typography.weights.semibold,
        color: errored ? '#991b1b' : colors.textPrimary,
        marginBottom: 4,
      }}>
        {label}
        {required && <span style={{ color: '#991b1b', marginLeft: 4 }} aria-hidden>*</span>}
      </label>
      {children}
    </div>
  )
}

const fieldRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: spacing.sm,
  flexWrap: 'wrap',
}

function inputStyle(errored: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: `${spacing.xs} ${spacing.sm}`,
    border: `1px solid ${errored ? '#991b1b' : colors.border}`,
    borderRadius: radius.sm,
    fontSize: typography.sizes.base,
    backgroundColor: 'white',
    color: colors.textPrimary,
    boxSizing: 'border-box',
  }
}
