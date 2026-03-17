'use client'

import { useState } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface NotifyMeCaptureProps {
  vertical: string
  zipCode?: string | null
  locationText?: string | null
}

export default function NotifyMeCapture({ vertical, zipCode, locationText }: NotifyMeCaptureProps) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const formatPhone = (value: string): string => {
    const digits = value.replace(/\D/g, '')
    const local = digits.startsWith('1') && digits.length > 10 ? digits.slice(1) : digits
    if (local.length <= 3) return local
    if (local.length <= 6) return `(${local.slice(0, 3)}) ${local.slice(3)}`
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6, 10)}`
  }

  const handleSubmit = async () => {
    if (!email && !phone) {
      setError('Please enter your email or phone number')
      return
    }
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/buyer-interests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email || undefined,
          phone: phone ? phone.replace(/\D/g, '') : undefined,
          zip_code: zipCode || undefined,
          vertical,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setSubmitted(true)
        setMessage(data.message)
      } else {
        setError(data.error || 'Something went wrong')
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div style={{
        padding: spacing.md,
        backgroundColor: '#f0fdf4',
        border: '1px solid #86efac',
        borderRadius: radius.md,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: typography.sizes.lg, marginBottom: spacing.xs }}>🎉</div>
        <p style={{
          margin: 0,
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold,
          color: '#166534',
        }}>
          {message || "We'll notify you when vendors are in your area!"}
        </p>
      </div>
    )
  }

  return (
    <div style={{
      padding: spacing.md,
      backgroundColor: '#eff6ff',
      border: '1px solid #bfdbfe',
      borderRadius: radius.md,
    }}>
      <h4 style={{
        margin: `0 0 ${spacing['2xs']} 0`,
        fontSize: typography.sizes.base,
        fontWeight: typography.weights.semibold,
        color: '#1e40af',
      }}>
        Want to know when vendors are {locationText ? `near ${locationText}` : 'in your area'}?
      </h4>
      <p style={{
        margin: `0 0 ${spacing.xs} 0`,
        fontSize: typography.sizes.sm,
        color: '#1e40af',
      }}>
        Leave your contact info and we&apos;ll let you know.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null) }}
          style={{
            padding: `${spacing['2xs']} ${spacing.xs}`,
            borderRadius: radius.sm,
            border: '1px solid #bfdbfe',
            fontSize: typography.sizes.sm,
            outline: 'none',
          }}
        />
        <input
          type="tel"
          placeholder="Phone number (optional)"
          value={phone}
          onChange={(e) => { setPhone(formatPhone(e.target.value)); setError(null) }}
          style={{
            padding: `${spacing['2xs']} ${spacing.xs}`,
            borderRadius: radius.sm,
            border: '1px solid #bfdbfe',
            fontSize: typography.sizes.sm,
            outline: 'none',
          }}
        />
      </div>

      {error && (
        <p style={{ margin: `${spacing['2xs']} 0 0 0`, fontSize: typography.sizes.xs, color: '#dc2626' }}>
          {error}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          marginTop: spacing.xs,
          width: '100%',
          padding: `${spacing['2xs']} ${spacing.md}`,
          backgroundColor: '#2563eb',
          color: 'white',
          border: 'none',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold,
          cursor: submitting ? 'wait' : 'pointer',
        }}
      >
        {submitting ? 'Submitting...' : 'Notify Me'}
      </button>

      <p style={{
        margin: `${spacing['2xs']} 0 0 0`,
        fontSize: typography.sizes.xs,
        color: '#6b7280',
        textAlign: 'center',
      }}>
        We&apos;ll only contact you about availability in your area. No spam.
      </p>
    </div>
  )
}
