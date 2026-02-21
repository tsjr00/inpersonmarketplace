'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, containers, statusColors } from '@/lib/design-tokens'

interface Finding {
  id: string
  check_type: string
  severity: 'action_required' | 'heads_up' | 'suggestion'
  title: string
  message: string
  details: Record<string, unknown>
  created_at: string
}

const SEVERITY_CONFIG = {
  action_required: {
    label: 'Action Required',
    color: statusColors.danger,
    bgColor: statusColors.dangerLight,
    borderColor: statusColors.dangerBorder,
  },
  heads_up: {
    label: 'Heads Up',
    color: statusColors.warning,
    bgColor: statusColors.warningLight,
    borderColor: statusColors.warningBorder,
  },
  suggestion: {
    label: 'Suggestion',
    color: statusColors.info,
    bgColor: statusColors.infoLight,
    borderColor: statusColors.infoBorder,
  },
} as const

export default function QualityFindingsPage() {
  const params = useParams()
  const vertical = params.vertical as string

  const [findings, setFindings] = useState<Finding[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissing, setDismissing] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchFindings = useCallback(async () => {
    try {
      const res = await fetch(`/api/vendor/quality-findings?vertical=${vertical}`)
      if (res.ok) {
        const data = await res.json()
        setFindings(data.findings || [])
      }
    } catch {
      // Fail silently
    } finally {
      setLoading(false)
    }
  }, [vertical])

  useEffect(() => {
    fetchFindings()
  }, [fetchFindings])

  async function handleDismiss(findingId: string) {
    setDismissing(findingId)
    try {
      const res = await fetch('/api/vendor/quality-findings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId }),
      })
      if (res.ok) {
        setFindings(prev => prev.filter(f => f.id !== findingId))
      }
    } catch {
      // Fail silently
    } finally {
      setDismissing(null)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      color: colors.textPrimary,
    }}>
      <div style={{
        maxWidth: containers.lg,
        margin: '0 auto',
        padding: `${spacing.md} ${spacing.sm}`,
      }}>
        {/* Header */}
        <div style={{
          marginBottom: spacing.md,
          display: 'flex',
          alignItems: 'center',
          gap: spacing.sm,
        }}>
          <Link
            href={`/${vertical}/vendor/dashboard`}
            style={{
              color: colors.primary,
              textDecoration: 'none',
              fontSize: typography.sizes.sm,
            }}
          >
            Dashboard
          </Link>
          <span style={{ color: colors.textMuted }}>/</span>
          <h1 style={{
            color: colors.primary,
            margin: 0,
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.bold,
          }}>
            Quality Checks
          </h1>
        </div>

        <p style={{
          color: colors.textSecondary,
          fontSize: typography.sizes.sm,
          marginBottom: spacing.md,
        }}>
          Our nightly scan checks for common issues like schedule conflicts, stale listings, and inventory problems.
          Dismissed items won&apos;t appear again for 7 days unless the issue persists.
        </p>

        {loading ? (
          <p style={{ color: colors.textMuted, textAlign: 'center', padding: spacing.xl }}>
            Loading...
          </p>
        ) : findings.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: spacing['2xl'],
            backgroundColor: statusColors.successLight,
            borderRadius: radius.lg,
            border: `1px solid ${statusColors.successBorder}`,
          }}>
            <p style={{
              fontSize: typography.sizes.lg,
              fontWeight: typography.weights.semibold,
              color: statusColors.success,
              margin: 0,
            }}>
              All clear! No issues found.
            </p>
            <p style={{
              color: colors.textSecondary,
              fontSize: typography.sizes.sm,
              margin: `${spacing.xs} 0 0 0`,
            }}>
              We check your listings, schedules, and inventory every night.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {findings.map(finding => {
              const config = SEVERITY_CONFIG[finding.severity]
              const isExpanded = expandedId === finding.id
              const isDismissing = dismissing === finding.id

              return (
                <div
                  key={finding.id}
                  style={{
                    padding: spacing.sm,
                    backgroundColor: colors.surfaceElevated,
                    border: `2px solid ${config.borderColor}`,
                    borderRadius: radius.md,
                    boxShadow: shadows.sm,
                  }}
                >
                  {/* Severity badge + title */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: spacing.xs,
                    flexWrap: 'wrap',
                  }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <span style={{
                        display: 'inline-block',
                        padding: `2px ${spacing.xs}`,
                        backgroundColor: config.bgColor,
                        color: config.color,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        fontWeight: typography.weights.semibold,
                        marginBottom: spacing['2xs'],
                      }}>
                        {config.label}
                      </span>
                      <h3 style={{
                        margin: `${spacing['2xs']} 0`,
                        fontSize: typography.sizes.base,
                        fontWeight: typography.weights.semibold,
                        color: colors.textPrimary,
                      }}>
                        {finding.title}
                      </h3>
                      <p style={{
                        margin: 0,
                        fontSize: typography.sizes.sm,
                        color: colors.textSecondary,
                        lineHeight: 1.5,
                      }}>
                        {finding.message}
                      </p>
                    </div>

                    <button
                      onClick={() => handleDismiss(finding.id)}
                      disabled={isDismissing}
                      style={{
                        padding: `${spacing['2xs']} ${spacing.sm}`,
                        backgroundColor: 'transparent',
                        border: `1px solid ${colors.border}`,
                        borderRadius: radius.sm,
                        fontSize: typography.sizes.xs,
                        color: colors.textMuted,
                        cursor: isDismissing ? 'wait' : 'pointer',
                        opacity: isDismissing ? 0.5 : 1,
                        whiteSpace: 'nowrap',
                        minHeight: 36,
                      }}
                    >
                      {isDismissing ? 'Dismissing...' : 'Dismiss'}
                    </button>
                  </div>

                  {/* Expandable details */}
                  {finding.details && Object.keys(finding.details).length > 0 && (
                    <div style={{ marginTop: spacing.xs }}>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : finding.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: colors.primary,
                          fontSize: typography.sizes.xs,
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline',
                        }}
                      >
                        {isExpanded ? 'Hide details' : 'Show details'}
                      </button>
                      {isExpanded && (
                        <pre style={{
                          marginTop: spacing['2xs'],
                          padding: spacing.xs,
                          backgroundColor: statusColors.neutral50,
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          overflow: 'auto',
                          maxHeight: 200,
                          color: statusColors.neutral700,
                        }}>
                          {JSON.stringify(finding.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
