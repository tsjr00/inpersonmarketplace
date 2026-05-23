'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import {
  getCategoriesForKind,
  type SurveyKind,
} from '@/lib/surveys/types'

interface SurveyFormProps {
  kind: SurveyKind
  marketName: string
  marketDateDisplay: string
  vertical: string
  /** Vendor path: pass surveyId; auth required server-side. */
  surveyId?: string
  /** Buyer path: pass accessToken; no auth required server-side. */
  accessToken?: string
}

/**
 * Shared rating form for vendor + buyer surveys (Phase E Stage 3 + 4).
 *
 * Renders the categories for the given kind as 1-5 button rows + a
 * comment textarea. All categories are required. On submit, POSTs to
 * /api/surveys/respond with either {surveyId} (vendor auth path) or
 * {accessToken} (buyer token path).
 */
export default function SurveyForm({
  kind,
  marketName,
  marketDateDisplay,
  vertical,
  surveyId,
  accessToken,
}: SurveyFormProps) {
  const router = useRouter()
  const categories = getCategoriesForKind(kind)
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Client-side guard: all categories required
    for (const cat of categories) {
      if (!ratings[cat.dbColumn as string]) {
        setError(`Please rate "${cat.label}" before submitting.`)
        return
      }
    }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        ...ratings,
        comment: comment.trim() || null,
      }
      if (surveyId) body.surveyId = surveyId
      if (accessToken) body.accessToken = accessToken

      const res = await fetch('/api/surveys/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Submission failed. Please try again.')
        setSubmitting(false)
        return
      }
      setSubmitted(true)
    } catch {
      setError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div style={{
        padding: spacing.lg,
        backgroundColor: '#d4edda',
        border: '1px solid #c3e6cb',
        borderRadius: radius.md,
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: typography.sizes.xl,
          fontWeight: typography.weights.semibold,
          color: '#155724',
          marginBottom: spacing.xs,
        }}>
          ✓ Thanks for the feedback!
        </div>
        <p style={{
          margin: 0,
          marginBottom: spacing.md,
          color: '#155724',
          lineHeight: 1.5,
        }}>
          Your rating helps the market keep getting better — and helps the manager prove the market&apos;s impact to funders.
        </p>
        {kind === 'vendor' && (
          <button
            type="button"
            onClick={() => router.push(`/${vertical}/vendor/surveys`)}
            style={primaryButtonStyle}
          >
            See my other surveys
          </button>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{
      padding: spacing.lg,
      backgroundColor: colors.surfaceElevated,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
    }}>
      <p style={{
        margin: 0,
        marginBottom: spacing.md,
        color: colors.textMuted,
        fontSize: typography.sizes.sm,
        lineHeight: 1.5,
      }}>
        How was <strong>{marketName}</strong> on <strong>{marketDateDisplay}</strong>?
        {' '}Rate each category 1 (poor) to 5 (excellent). Takes under a minute.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
        {categories.map((cat) => (
          <div key={cat.dbColumn as string}>
            <div style={{
              fontWeight: typography.weights.semibold,
              fontSize: typography.sizes.sm,
              color: colors.textPrimary,
              marginBottom: 2,
            }}>
              {cat.label}
            </div>
            <div style={{
              fontSize: typography.sizes.xs,
              color: colors.textMuted,
              marginBottom: spacing['2xs'],
              lineHeight: 1.4,
            }}>
              {cat.description}
            </div>
            <RatingRow
              value={ratings[cat.dbColumn as string] ?? null}
              onChange={(v) =>
                setRatings((s) => ({ ...s, [cat.dbColumn as string]: v }))
              }
              disabled={submitting}
            />
          </div>
        ))}

        <div>
          <label style={{
            display: 'block',
            fontWeight: typography.weights.semibold,
            fontSize: typography.sizes.sm,
            color: colors.textPrimary,
            marginBottom: spacing['2xs'],
          }}>
            Anything else? (optional)
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={submitting}
            maxLength={2000}
            rows={3}
            placeholder={
              kind === 'vendor'
                ? 'What worked, what didn&apos;t, suggestions for the manager...'
                : 'What stood out, what to improve, anything to share with the market...'
            }
            style={{
              width: '100%',
              padding: spacing.xs,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontFamily: 'inherit',
              resize: 'vertical',
              minHeight: 70,
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {error && (
        <div style={{
          marginTop: spacing.md,
          padding: spacing.sm,
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: spacing.md }}>
        <button
          type="submit"
          disabled={submitting}
          style={{
            ...primaryButtonStyle,
            opacity: submitting ? 0.6 : 1,
            cursor: submitting ? 'wait' : 'pointer',
          }}
        >
          {submitting ? 'Submitting…' : 'Submit survey'}
        </button>
      </div>
    </form>
  )
}

function RatingRow({
  value,
  onChange,
  disabled,
}: {
  value: number | null
  onChange: (v: number) => void
  disabled: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: spacing['2xs'], flexWrap: 'wrap' }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const selected = value === n
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            disabled={disabled}
            aria-label={`Rate ${n} out of 5`}
            style={{
              width: 44,
              height: 44,
              borderRadius: radius.sm,
              border: `1px solid ${selected ? '#2d5016' : colors.border}`,
              backgroundColor: selected ? '#2d5016' : 'white',
              color: selected ? 'white' : colors.textPrimary,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              cursor: disabled ? 'wait' : 'pointer',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

const primaryButtonStyle: React.CSSProperties = {
  padding: `${spacing.xs} ${spacing.md}`,
  backgroundColor: '#2d5016',
  color: 'white',
  border: 'none',
  borderRadius: radius.sm,
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
  cursor: 'pointer',
}
