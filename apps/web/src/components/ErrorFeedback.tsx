'use client'

import { useState, useMemo } from 'react'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { lookupError } from '@/lib/errors/error-catalog'

interface ErrorFeedbackProps {
  errorCode?: string
  traceId?: string
  errorMessage?: string
  verticalId?: string
  pageUrl?: string
  onClose?: () => void
}

/**
 * ErrorFeedback Component
 *
 * Allows users to report errors they encounter. Can be shown inline with
 * an error message or opened as a modal.
 *
 * Usage:
 * ```tsx
 * <ErrorFeedback
 *   errorCode="ERR_RLS_001"
 *   traceId="abc123"
 *   errorMessage="Failed to load orders"
 *   verticalId={verticalId}
 * />
 * ```
 */
export function ErrorFeedback({
  errorCode,
  traceId,
  errorMessage,
  verticalId,
  pageUrl,
  onClose,
}: ErrorFeedbackProps) {
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const response = await fetch('/api/errors/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorCode,
          traceId,
          verticalId,
          pageUrl: pageUrl || window.location.href,
          userDescription: description,
          reporterEmail: email || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to submit report')
      }

      setIsSubmitted(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit report')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSubmitted) {
    return (
      <div style={{
        padding: spacing.md,
        backgroundColor: colors.primaryLight,
        border: `1px solid ${colors.primary}`,
        borderRadius: radius.md,
        marginTop: spacing.sm,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
          <span style={{ fontSize: typography.sizes.lg }}>✓</span>
          <div>
            <p style={{ margin: 0, fontWeight: typography.weights.medium, color: colors.primaryDark }}>
              Report submitted
            </p>
            <p style={{ margin: `${spacing['2xs']} 0 0`, fontSize: typography.sizes.sm, color: colors.primaryDark }}>
              Thank you! Our team will investigate this issue.
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              marginTop: spacing.sm,
              padding: `${spacing['2xs']} ${spacing.sm}`,
              backgroundColor: 'transparent',
              border: `1px solid ${colors.primaryDark}`,
              borderRadius: radius.sm,
              color: colors.primaryDark,
              cursor: 'pointer',
              fontSize: typography.sizes.sm,
            }}
          >
            Dismiss
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{
      padding: spacing.md,
      backgroundColor: colors.surfaceElevated,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      marginTop: spacing.sm,
    }}>
      <h4 style={{
        margin: `0 0 ${spacing.sm}`,
        fontSize: typography.sizes.base,
        fontWeight: typography.weights.semibold,
        color: colors.textPrimary,
      }}>
        Report this error
      </h4>

      <form onSubmit={handleSubmit}>
        {/* Error info display */}
        {(errorCode || traceId) && (
          <div style={{
            padding: spacing.xs,
            backgroundColor: colors.surfaceMuted,
            borderRadius: radius.sm,
            marginBottom: spacing.sm,
            fontFamily: 'monospace',
            fontSize: typography.sizes.xs,
            color: colors.textSecondary,
          }}>
            {errorCode && <div>Error: {errorCode}</div>}
            {traceId && <div>Ref: {traceId}</div>}
            {errorMessage && <div style={{ marginTop: spacing['3xs'] }}>{errorMessage}</div>}
          </div>
        )}

        {/* Description */}
        <div style={{ marginBottom: spacing.sm }}>
          <label
            htmlFor="error-description"
            style={{
              display: 'block',
              marginBottom: spacing['2xs'],
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium,
              color: colors.textSecondary,
            }}
          >
            What were you trying to do? (optional)
          </label>
          <textarea
            id="error-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you were doing when the error occurred..."
            rows={3}
            style={{
              width: '100%',
              padding: spacing.xs,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Email */}
        <div style={{ marginBottom: spacing.sm }}>
          <label
            htmlFor="error-email"
            style={{
              display: 'block',
              marginBottom: spacing['2xs'],
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium,
              color: colors.textSecondary,
            }}
          >
            Your email (optional, for follow-up)
          </label>
          <input
            id="error-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            style={{
              width: '100%',
              padding: spacing.xs,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
            }}
          />
        </div>

        {submitError && (
          <div style={{
            padding: spacing.xs,
            backgroundColor: '#fee2e2',
            border: '1px solid #fecaca',
            borderRadius: radius.sm,
            marginBottom: spacing.sm,
            color: '#991b1b',
            fontSize: typography.sizes.sm,
          }}>
            {submitError}
          </div>
        )}

        <div style={{ display: 'flex', gap: spacing.xs }}>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: colors.primary,
              color: colors.textInverse,
              border: 'none',
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Report'}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: `${spacing.xs} ${spacing.md}`,
                backgroundColor: 'transparent',
                color: colors.textSecondary,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

/**
 * Inline error display with report button
 *
 * Usage:
 * ```tsx
 * {error && (
 *   <ErrorDisplay
 *     error={error}
 *     verticalId={verticalId}
 *   />
 * )}
 * ```
 */
interface ErrorDisplayProps {
  error: {
    message: string
    code?: string
    traceId?: string
  }
  verticalId?: string
}

export function ErrorDisplay({ error, verticalId }: ErrorDisplayProps) {
  const [showFeedback, setShowFeedback] = useState(false)
  const catalogEntry = useMemo(
    () => (error.code ? lookupError(error.code) : undefined),
    [error.code]
  )

  const guidance = catalogEntry?.userGuidance
  const selfResolvable = catalogEntry?.selfResolvable ?? false

  return (
    <div>
      <div style={{
        padding: spacing.sm,
        backgroundColor: '#fee2e2',
        border: '1px solid #fecaca',
        borderRadius: radius.md,
        color: '#991b1b',
        fontSize: typography.sizes.sm,
      }}>
        {/* User guidance shown prominently when available */}
        {guidance ? (
          <>
            <div style={{ fontWeight: typography.weights.medium }}>{guidance}</div>
            <div style={{
              marginTop: spacing['2xs'],
              fontSize: typography.sizes.xs,
              color: '#7f1d1d',
              opacity: 0.7,
            }}>
              {error.message}
            </div>
          </>
        ) : (
          <div style={{ fontWeight: typography.weights.medium }}>{error.message}</div>
        )}
        {(error.code || error.traceId) && (
          <div style={{
            marginTop: spacing['2xs'],
            fontSize: typography.sizes.xs,
            fontFamily: 'monospace',
            color: '#7f1d1d',
            opacity: 0.8,
          }}>
            {error.code && <span>Error: {error.code}</span>}
            {error.code && error.traceId && <span> • </span>}
            {error.traceId && <span>Ref: {error.traceId}</span>}
          </div>
        )}
        {!showFeedback && (
          selfResolvable ? (
            <button
              onClick={() => setShowFeedback(true)}
              style={{
                marginTop: spacing.xs,
                padding: 0,
                backgroundColor: 'transparent',
                border: 'none',
                color: '#7f1d1d',
                fontSize: typography.sizes.xs,
                cursor: 'pointer',
                textDecoration: 'underline',
                opacity: 0.8,
              }}
            >
              Still having trouble? Report this error
            </button>
          ) : (
            <button
              onClick={() => setShowFeedback(true)}
              style={{
                marginTop: spacing.xs,
                padding: `${spacing['2xs']} ${spacing.xs}`,
                backgroundColor: 'transparent',
                border: '1px solid #991b1b',
                borderRadius: radius.sm,
                color: '#991b1b',
                fontSize: typography.sizes.xs,
                cursor: 'pointer',
              }}
            >
              Report this error
            </button>
          )
        )}
      </div>
      {showFeedback && (
        <ErrorFeedback
          errorCode={error.code}
          traceId={error.traceId}
          errorMessage={error.message}
          verticalId={verticalId}
          onClose={() => setShowFeedback(false)}
        />
      )}
    </div>
  )
}
