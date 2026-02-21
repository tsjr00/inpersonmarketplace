'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { colors, spacing, typography, radius, shadows, containers, statusColors } from '@/lib/design-tokens'
import { getFtTierExtras, getFtTierLabel } from '@/lib/vendor-limits'

interface RevenueRow { marketId: string; marketName: string; city: string; revenue: number; orderCount: number }
interface PeakDayRow { marketId: string; marketName: string; days: { day: string; dayIndex: number; count: number }[]; peakDay: string }
interface AvgOrderRow { marketId: string; marketName: string; avgOrderCents: number; orderCount: number }
interface LoyaltyRow { marketId: string; marketName: string; totalCustomers: number; newCustomers: number; repeatCustomers: number; repeatPct: number }
interface MissingMarketRow { marketId: string; name: string; city: string; state: string; distanceMiles: number; vendorCount: number; marketType: string }
interface ScoreRow { marketId: string; marketName: string; score: number; factors: { volume: number; uniqueBuyers: number; avgTicket: number; repeatRate: number } }
interface DensityRow { marketId: string; marketName: string; within5mi: number; within10mi: number; within25mi: number }
interface CoverageRow { zip: string; city: string; state: string; searchCount: number; zeroResultPct: number }

interface InsightsData {
  blocked?: boolean
  tier: string
  insightLevel: 'none' | 'basic' | 'pro' | 'boss'
  days: number
  maxDays: number
  revenueByLocation: RevenueRow[]
  peakDaysByLocation: PeakDayRow[]
  avgOrderByLocation: AvgOrderRow[]
  customerLoyalty: LoyaltyRow[]
  missingMarkets?: MissingMarketRow[]
  locationScores?: ScoreRow[]
  buyerDensity?: DensityRow[]
  coverageGaps?: CoverageRow[]
}

const cardStyle: React.CSSProperties = {
  padding: spacing.sm,
  backgroundColor: colors.surfaceElevated,
  borderRadius: radius.md,
  border: `1px solid ${colors.border}`,
  boxShadow: shadows.sm,
  marginBottom: spacing.md,
}

const sectionTitle: React.CSSProperties = {
  margin: `0 0 ${spacing.sm} 0`,
  fontSize: typography.sizes.lg,
  fontWeight: typography.weights.semibold,
  color: colors.textPrimary,
}

const tableHeaderCell: React.CSSProperties = {
  padding: `${spacing['2xs']} ${spacing.xs}`,
  textAlign: 'left' as const,
  fontSize: typography.sizes.xs,
  fontWeight: typography.weights.semibold,
  color: colors.textMuted,
  borderBottom: `1px solid ${colors.border}`,
}

const tableCell: React.CSSProperties = {
  padding: `${spacing['2xs']} ${spacing.xs}`,
  fontSize: typography.sizes.sm,
  color: colors.textPrimary,
  borderBottom: `1px solid ${colors.borderMuted}`,
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function LockedSection({ title, description, tierNeeded, vertical }: { title: string; description: string; tierNeeded: string; vertical: string }) {
  return (
    <div style={{
      ...cardStyle,
      opacity: 0.6,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: colors.surfaceMuted,
        opacity: 0.5,
        zIndex: 1,
      }} />
      <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: spacing.md }}>
        <h3 style={{ ...sectionTitle, color: colors.textMuted }}>{title}</h3>
        <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm, margin: `0 0 ${spacing.sm} 0` }}>
          {description}
        </p>
        <Link
          href={`/${vertical}/vendor/dashboard/upgrade`}
          style={{
            display: 'inline-block',
            padding: `${spacing.xs} ${spacing.md}`,
            backgroundColor: 'transparent',
            color: '#ff5757',
            textDecoration: 'none',
            borderRadius: radius.md,
            fontWeight: typography.weights.semibold,
            fontSize: typography.sizes.sm,
            border: '2px solid #ff5757',
          }}
        >
          Upgrade to {tierNeeded}
        </Link>
      </div>
    </div>
  )
}

function DayBar({ count, maxCount }: { count: number; maxCount: number }) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: spacing['2xs'],
    }}>
      <div style={{
        height: 8,
        width: `${Math.max(pct, 4)}%`,
        backgroundColor: colors.primary,
        borderRadius: radius.full,
        minWidth: 4,
        maxWidth: '70%',
      }} />
      <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>{count}</span>
    </div>
  )
}

function StarScore({ score }: { score: number }) {
  const filled = Math.round(score)
  return (
    <span style={{ fontSize: typography.sizes.sm, letterSpacing: 1 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ color: i < filled ? '#FBC02D' : colors.borderMuted }}>
          {i < filled ? '\u2605' : '\u2606'}
        </span>
      ))}
      <span style={{ marginLeft: spacing['2xs'], color: colors.textMuted, fontSize: typography.sizes.xs }}>
        {score.toFixed(1)}
      </span>
    </span>
  )
}

export default function VendorInsightsPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params?.vertical as string

  const [vendorId, setVendorId] = useState<string | null>(null)
  const [vendorTier, setVendorTier] = useState<string>('free')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<InsightsData | null>(null)
  const [days, setDays] = useState(30)

  // Fetch vendor profile
  useEffect(() => {
    async function fetchVendor() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push(`/${vertical}/login`); return }

      const { data: vp, error: vpError } = await supabase
        .from('vendor_profiles')
        .select('id, tier')
        .eq('user_id', user.id)
        .eq('vertical_id', vertical)
        .single()

      if (vpError || !vp) { setError('Vendor profile not found'); setLoading(false); return }

      setVendorId(vp.id)
      setVendorTier(vp.tier || 'free')
    }
    fetchVendor()
  }, [vertical, router])

  const fetchInsights = useCallback(async () => {
    if (!vendorId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/vendor/location-insights?vendor_id=${vendorId}&vertical=${vertical}&days=${days}`)
      if (res.ok) {
        setData(await res.json())
      } else {
        setError('Failed to load insights')
      }
    } catch {
      setError('Failed to load insights')
    } finally {
      setLoading(false)
    }
  }, [vendorId, vertical, days])

  useEffect(() => {
    if (vendorId) fetchInsights()
  }, [vendorId, fetchInsights])

  const isFt = vertical === 'food_trucks'
  const extras = getFtTierExtras(vendorTier)
  const insightsBlocked = isFt && extras.locationInsights === 'none'

  // Free tier — full page block
  if (insightsBlocked || data?.blocked) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: colors.surfaceBase,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: spacing.md }}>
          <div style={{
            width: 80, height: 80,
            backgroundColor: '#FFF3E0',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
            fontSize: 36,
          }}>
            {/* Map pin icon via text */}
            <span role="img" aria-label="location">&#x1F4CD;</span>
          </div>
          <h1 style={{
            fontSize: typography.sizes['2xl'],
            fontWeight: typography.weights.bold,
            color: colors.textPrimary,
            margin: '0 0 12px 0',
          }}>
            Unlock Location Insights
          </h1>
          <p style={{
            fontSize: typography.sizes.base,
            color: colors.textMuted,
            margin: '0 0 16px 0',
            lineHeight: 1.6,
          }}>
            See which locations drive the most revenue, find new markets to expand into, and discover where demand is highest.
          </p>
          <div style={{
            textAlign: 'left',
            margin: `0 auto ${spacing.md}`,
            maxWidth: 320,
          }}>
            {[
              'Revenue by location',
              'Peak selling days',
              'New vs repeat customers',
              'Markets you\'re missing (Pro)',
              'Buyer density maps (Boss)',
            ].map(feat => (
              <div key={feat} style={{
                display: 'flex', alignItems: 'center', gap: spacing.xs,
                padding: `${spacing['3xs']} 0`,
                fontSize: typography.sizes.sm, color: colors.textSecondary,
              }}>
                <span style={{ color: statusColors.success }}>&#10003;</span>
                {feat}
              </div>
            ))}
          </div>
          <Link
            href={`/${vertical}/vendor/dashboard/upgrade`}
            style={{
              display: 'inline-block',
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: 'transparent',
              color: '#ff5757',
              textDecoration: 'none',
              borderRadius: radius.md,
              fontWeight: typography.weights.semibold,
              fontSize: typography.sizes.base,
              border: '2px solid #ff5757',
            }}
          >
            View Plans
          </Link>
          <div style={{ marginTop: spacing.sm }}>
            <Link
              href={`/${vertical}/vendor/dashboard`}
              style={{ color: colors.textMuted, textDecoration: 'none', fontSize: typography.sizes.sm }}
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh', backgroundColor: colors.surfaceBase,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: statusColors.danger,
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Error</h2>
          <p>{error}</p>
          <Link href={`/${vertical}/vendor/dashboard`} style={{
            display: 'inline-block', marginTop: spacing.sm,
            padding: `${spacing['2xs']} ${spacing.sm}`,
            backgroundColor: 'transparent', color: '#737373',
            textDecoration: 'none', borderRadius: radius.sm,
            border: '2px solid #737373',
          }}>
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const insightLevel = data?.insightLevel || extras.locationInsights
  const showPro = insightLevel === 'pro' || insightLevel === 'boss'
  const showBoss = insightLevel === 'boss'
  const tierLabel = getFtTierLabel(vendorTier)

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.surfaceBase, color: colors.textPrimary }} className="insights-page">
      <div style={{ maxWidth: containers.xl, margin: '0 auto', padding: `${spacing.md} ${spacing.sm}` }}>
        {/* Header */}
        <div style={{
          marginBottom: spacing.md,
          paddingBottom: spacing.sm,
          borderBottom: `2px solid ${colors.primary}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: spacing.sm,
        }}>
          <div>
            <h1 style={{ color: colors.primary, margin: 0, fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold }}>
              Location Insights
            </h1>
            <p style={{ margin: `${spacing['2xs']} 0 0`, fontSize: typography.sizes.sm, color: colors.textMuted }}>
              {tierLabel} Plan
            </p>
          </div>
          <Link
            href={`/${vertical}/vendor/dashboard`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: `${spacing['2xs']} ${spacing.sm}`,
              backgroundColor: colors.primaryDark, color: colors.textInverse,
              textDecoration: 'none', borderRadius: radius.sm,
              fontWeight: typography.weights.semibold, minHeight: 44,
            }}
          >
            Back to Dashboard
          </Link>
        </div>

        {/* Date range selector */}
        <div style={{
          marginBottom: spacing.md, padding: spacing.sm,
          backgroundColor: colors.surfaceElevated, borderRadius: radius.md,
          border: `1px solid ${colors.border}`, boxShadow: shadows.sm,
          display: 'flex', gap: spacing.xs, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>Period:</span>
          {[7, 30, 90].map(d => {
            const disabled = d > (data?.maxDays || 30)
            return (
              <button
                key={d}
                onClick={() => !disabled && setDays(d)}
                disabled={disabled}
                style={{
                  padding: `${spacing['3xs']} ${spacing.xs}`,
                  borderRadius: radius.sm,
                  border: 'none',
                  fontSize: typography.sizes.xs,
                  fontWeight: typography.weights.semibold,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  backgroundColor: days === d ? colors.primary : colors.surfaceMuted,
                  color: days === d ? colors.textInverse : disabled ? colors.textMuted : colors.textSecondary,
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                {d}d
                {disabled && insightLevel === 'basic' && d === 90 && ' (Pro)'}
              </button>
            )
          })}
        </div>

        {loading && !data ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400, color: colors.textMuted }}>
            Loading insights...
          </div>
        ) : data && !data.blocked ? (
          <>
            {/* ═══ BASIC TIER: Revenue by Location ═══ */}
            <div style={cardStyle}>
              <h2 style={sectionTitle}>Revenue by Location</h2>
              {data.revenueByLocation.length === 0 ? (
                <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>No order data for this period.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={tableHeaderCell}>Location</th>
                        <th style={{ ...tableHeaderCell, textAlign: 'right' }}>Revenue</th>
                        <th style={{ ...tableHeaderCell, textAlign: 'right' }}>Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.revenueByLocation.map(row => (
                        <tr key={row.marketId}>
                          <td style={tableCell}>
                            <div style={{ fontWeight: typography.weights.medium }}>{row.marketName}</div>
                            {row.city && <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>{row.city}</div>}
                          </td>
                          <td style={{ ...tableCell, textAlign: 'right', fontWeight: typography.weights.semibold }}>{formatCents(row.revenue)}</td>
                          <td style={{ ...tableCell, textAlign: 'right' }}>{row.orderCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ═══ BASIC TIER: Peak Days by Location ═══ */}
            <div style={cardStyle}>
              <h2 style={sectionTitle}>Peak Days by Location</h2>
              {data.peakDaysByLocation.length === 0 ? (
                <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>No data available.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                  {data.peakDaysByLocation.map(row => {
                    const maxCount = Math.max(...row.days.map(d => d.count), 1)
                    return (
                      <div key={row.marketId}>
                        <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, marginBottom: spacing['2xs'] }}>
                          {row.marketName}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {row.days.map(d => (
                            <div key={d.day} style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                              <span style={{ fontSize: typography.sizes.xs, width: 32, color: colors.textMuted }}>{d.day}</span>
                              <div style={{ flex: 1 }}>
                                <DayBar count={d.count} maxCount={maxCount} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ═══ BASIC TIER: Avg Order Size ═══ */}
            <div style={cardStyle}>
              <h2 style={sectionTitle}>Average Order Size by Location</h2>
              {data.avgOrderByLocation.length === 0 ? (
                <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>No data available.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={tableHeaderCell}>Location</th>
                        <th style={{ ...tableHeaderCell, textAlign: 'right' }}>Avg Order</th>
                        <th style={{ ...tableHeaderCell, textAlign: 'right' }}>Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.avgOrderByLocation.map(row => (
                        <tr key={row.marketId}>
                          <td style={tableCell}>{row.marketName}</td>
                          <td style={{ ...tableCell, textAlign: 'right', fontWeight: typography.weights.semibold }}>{formatCents(row.avgOrderCents)}</td>
                          <td style={{ ...tableCell, textAlign: 'right' }}>{row.orderCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ═══ BASIC TIER: Customer Loyalty ═══ */}
            <div style={cardStyle}>
              <h2 style={sectionTitle}>Customer Loyalty by Location</h2>
              {data.customerLoyalty.length === 0 ? (
                <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>No data available.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={tableHeaderCell}>Location</th>
                        <th style={{ ...tableHeaderCell, textAlign: 'right' }}>Repeat %</th>
                        <th style={{ ...tableHeaderCell, textAlign: 'right' }}>New</th>
                        <th style={{ ...tableHeaderCell, textAlign: 'right' }}>Returning</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.customerLoyalty.map(row => (
                        <tr key={row.marketId}>
                          <td style={tableCell}>{row.marketName}</td>
                          <td style={{ ...tableCell, textAlign: 'right', fontWeight: typography.weights.semibold }}>
                            {row.repeatPct}%
                          </td>
                          <td style={{ ...tableCell, textAlign: 'right' }}>{row.newCustomers}</td>
                          <td style={{ ...tableCell, textAlign: 'right' }}>{row.repeatCustomers}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ═══ PRO TIER or locked ═══ */}
            {showPro && data.missingMarkets ? (
              <>
                {/* Markets You're Missing */}
                <div style={cardStyle}>
                  <h2 style={sectionTitle}>Markets You&apos;re Missing</h2>
                  <p style={{ margin: `0 0 ${spacing.sm}`, fontSize: typography.sizes.sm, color: colors.textMuted }}>
                    Active markets within 25 miles of your current locations
                  </p>
                  {data.missingMarkets.length === 0 ? (
                    <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>
                      You&apos;re already at all nearby markets. Nice coverage!
                    </p>
                  ) : (
                    <div className="insights-missing-grid" style={{ display: 'grid', gap: spacing.xs }}>
                      {data.missingMarkets.map(m => (
                        <div key={m.marketId} style={{
                          padding: spacing.xs,
                          backgroundColor: colors.surfaceMuted,
                          borderRadius: radius.sm,
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          flexWrap: 'wrap', gap: spacing.xs,
                        }}>
                          <div>
                            <div style={{ fontWeight: typography.weights.medium, fontSize: typography.sizes.sm }}>{m.name}</div>
                            <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                              {m.city}{m.state ? `, ${m.state}` : ''} &middot; {m.distanceMiles} mi &middot; {m.vendorCount} vendor{m.vendorCount !== 1 ? 's' : ''}
                            </div>
                          </div>
                          <Link
                            href={`/${vertical}/vendor/markets`}
                            style={{
                              fontSize: typography.sizes.xs,
                              color: colors.primary,
                              textDecoration: 'none',
                              padding: `${spacing['3xs']} ${spacing.xs}`,
                              backgroundColor: colors.surfaceElevated,
                              borderRadius: radius.sm,
                              border: `1px solid ${colors.border}`,
                            }}
                          >
                            Add
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Location Scores */}
                <div style={cardStyle}>
                  <h2 style={sectionTitle}>Location Performance Scores</h2>
                  <p style={{ margin: `0 0 ${spacing.sm}`, fontSize: typography.sizes.sm, color: colors.textMuted }}>
                    Composite score based on volume, unique buyers, ticket size, and repeat rate
                  </p>
                  {(data.locationScores || []).length === 0 ? (
                    <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>No scored locations yet.</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={tableHeaderCell}>Location</th>
                            <th style={tableHeaderCell}>Score</th>
                            <th style={{ ...tableHeaderCell, textAlign: 'right' }}>Volume</th>
                            <th style={{ ...tableHeaderCell, textAlign: 'right' }}>Buyers</th>
                            <th style={{ ...tableHeaderCell, textAlign: 'right' }}>Ticket</th>
                            <th style={{ ...tableHeaderCell, textAlign: 'right' }}>Repeat</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data.locationScores || []).map(row => (
                            <tr key={row.marketId}>
                              <td style={tableCell}>{row.marketName}</td>
                              <td style={tableCell}><StarScore score={row.score} /></td>
                              <td style={{ ...tableCell, textAlign: 'right' }}>{row.factors.volume.toFixed(1)}</td>
                              <td style={{ ...tableCell, textAlign: 'right' }}>{row.factors.uniqueBuyers.toFixed(1)}</td>
                              <td style={{ ...tableCell, textAlign: 'right' }}>{row.factors.avgTicket.toFixed(1)}</td>
                              <td style={{ ...tableCell, textAlign: 'right' }}>{row.factors.repeatRate.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : !showPro ? (
              <LockedSection
                title="Markets You're Missing + Location Scores"
                description="See nearby markets you're not attending yet, plus a performance score for each of your current locations."
                tierNeeded="Pro"
                vertical={vertical}
              />
            ) : null}

            {/* ═══ BOSS TIER or locked ═══ */}
            {showBoss && data.buyerDensity ? (
              <>
                {/* Buyer Density */}
                <div style={cardStyle}>
                  <h2 style={sectionTitle}>Buyer Density</h2>
                  <p style={{ margin: `0 0 ${spacing.sm}`, fontSize: typography.sizes.sm, color: colors.textMuted }}>
                    Number of registered buyers near each of your locations
                  </p>
                  {data.buyerDensity.length === 0 ? (
                    <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>No density data available.</p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={tableHeaderCell}>Location</th>
                            <th style={{ ...tableHeaderCell, textAlign: 'right' }}>Within 5 mi</th>
                            <th style={{ ...tableHeaderCell, textAlign: 'right' }}>Within 10 mi</th>
                            <th style={{ ...tableHeaderCell, textAlign: 'right' }}>Within 25 mi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.buyerDensity.map(row => (
                            <tr key={row.marketId}>
                              <td style={tableCell}>{row.marketName}</td>
                              <td style={{ ...tableCell, textAlign: 'right', fontWeight: typography.weights.semibold }}>{row.within5mi}</td>
                              <td style={{ ...tableCell, textAlign: 'right' }}>{row.within10mi}</td>
                              <td style={{ ...tableCell, textAlign: 'right' }}>{row.within25mi}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Coverage Gaps */}
                <div style={cardStyle}>
                  <h2 style={sectionTitle}>Coverage Gaps</h2>
                  <p style={{ margin: `0 0 ${spacing.sm}`, fontSize: typography.sizes.sm, color: colors.textMuted }}>
                    ZIP codes where buyers are searching but may not be finding enough results. High zero-result % indicates unmet demand.
                  </p>
                  {(data.coverageGaps || []).length === 0 ? (
                    <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>
                      Not enough search data yet. Coverage gaps appear as buyers search for food trucks in your area.
                    </p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={tableHeaderCell}>ZIP</th>
                            <th style={tableHeaderCell}>City</th>
                            <th style={{ ...tableHeaderCell, textAlign: 'right' }}>Searches</th>
                            <th style={{ ...tableHeaderCell, textAlign: 'right' }}>Zero Results</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(data.coverageGaps || []).map(row => (
                            <tr key={row.zip}>
                              <td style={tableCell}>{row.zip}</td>
                              <td style={tableCell}>{row.city}{row.state ? `, ${row.state}` : ''}</td>
                              <td style={{ ...tableCell, textAlign: 'right' }}>{row.searchCount}</td>
                              <td style={{
                                ...tableCell,
                                textAlign: 'right',
                                fontWeight: typography.weights.semibold,
                                color: row.zeroResultPct >= 50 ? statusColors.danger : row.zeroResultPct >= 25 ? statusColors.warning : colors.textPrimary,
                              }}>
                                {row.zeroResultPct}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : !showBoss ? (
              <LockedSection
                title="Buyer Density + Coverage Gaps"
                description="See how many buyers are near each of your locations and discover ZIP codes with unmet demand."
                tierNeeded="Boss"
                vertical={vertical}
              />
            ) : null}
          </>
        ) : null}
      </div>

      <style>{`
        .insights-page .insights-missing-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .insights-page .insights-missing-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  )
}
