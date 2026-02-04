'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AdminNav from '@/components/admin/AdminNav'
import MetricCard from '@/components/analytics/MetricCard'
import SalesChart from '@/components/analytics/SalesChart'
import TopVendorsTable from '@/components/analytics/TopVendorsTable'
import DateRangePicker from '@/components/analytics/DateRangePicker'
import { defaultBranding } from '@/lib/branding'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

interface OverviewData {
  totalRevenue: number
  totalOrders: number
  averageOrderValue: number
  completedOrders: number
  pendingOrders: number
  cancelledOrders: number
  totalUsers: number
  totalVendors: number
  totalListings: number
  publishedListings: number
  newUsers: number
}

interface TrendData {
  date: string
  revenue: number
  orders: number
}

interface TopVendor {
  vendor_id: string
  name: string
  vertical_id: string | null
  tier: string
  total_sales: number
  revenue: number
}

export default function VerticalAdminAnalyticsPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params?.vertical as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  // Date range state
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 30)
    return { start, end }
  })

  // Data states
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [trends, setTrends] = useState<TrendData[]>([])
  const [topVendors, setTopVendors] = useState<TopVendor[]>([])
  const [chartMetric, setChartMetric] = useState<'revenue' | 'orders'>('revenue')

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

  // Check auth
  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push(`/${vertical}/login`)
        return
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role, roles')
        .eq('user_id', user.id)
        .single()

      const hasAdminRole = profile?.role === 'admin' ||
                           profile?.role === 'platform_admin' ||
                           profile?.roles?.includes('admin') ||
                           profile?.roles?.includes('platform_admin')

      if (!hasAdminRole) {
        router.push(`/${vertical}/dashboard`)
        return
      }

      setIsAdmin(true)
    }

    checkAuth()
  }, [vertical, router])

  // Fetch analytics data
  const fetchAnalytics = useCallback(async () => {
    if (!isAdmin) return

    setLoading(true)
    const startDate = dateRange.start.toISOString().split('T')[0]
    const endDate = dateRange.end.toISOString().split('T')[0]

    try {
      const [overviewRes, trendsRes, vendorsRes] = await Promise.all([
        fetch(`/api/admin/analytics/overview?vertical_id=${vertical}&start_date=${startDate}&end_date=${endDate}`),
        fetch(`/api/admin/analytics/trends?vertical_id=${vertical}&start_date=${startDate}&end_date=${endDate}&period=day`),
        fetch(`/api/admin/analytics/top-vendors?vertical_id=${vertical}&start_date=${startDate}&end_date=${endDate}&limit=10`)
      ])

      if (overviewRes.ok) {
        const data = await overviewRes.json()
        setOverview(data)
      }

      if (trendsRes.ok) {
        const data = await trendsRes.json()
        setTrends(data)
      }

      if (vendorsRes.ok) {
        const data = await vendorsRes.json()
        setTopVendors(data)
      }
    } catch (err) {
      console.error('Error fetching analytics:', err)
      setError('Failed to load analytics data')
    } finally {
      setLoading(false)
    }
  }, [isAdmin, vertical, dateRange])

  useEffect(() => {
    if (isAdmin) {
      fetchAnalytics()
    }
  }, [isAdmin, fetchAnalytics])

  // Auto-refresh hourly (reduced from 5 min - user can manually refresh if needed)
  // Includes visibility handling to pause when tab is hidden
  useEffect(() => {
    if (!isAdmin) return

    let intervalId: NodeJS.Timeout | null = null
    let hiddenAt: number | null = null

    const startInterval = () => {
      if (intervalId) clearInterval(intervalId)
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchAnalytics()
        }
      }, 60 * 60 * 1000) // 1 hour
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        if (intervalId) {
          clearInterval(intervalId)
          intervalId = null
        }
      } else {
        // Refresh if away > 5 minutes
        if (hiddenAt && (Date.now() - hiddenAt) > 5 * 60 * 1000) {
          fetchAnalytics()
        }
        hiddenAt = null
        startInterval()
      }
    }

    startInterval()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (intervalId) clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isAdmin, fetchAnalytics])

  if (!isAdmin) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: colors.surfaceBase,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: colors.textMuted
      }}>
        Checking authorization...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: colors.surfaceBase,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#dc2626'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Error</h2>
          <p>{error}</p>
          <Link
            href={`/${vertical}/admin`}
            style={{
              display: 'inline-block',
              marginTop: spacing.sm,
              padding: `${spacing['2xs']} ${spacing.sm}`,
              backgroundColor: colors.primary,
              color: colors.textInverse,
              textDecoration: 'none',
              borderRadius: radius.sm
            }}
          >
            Back to Admin
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: colors.surfaceBase,
        color: colors.textPrimary
      }}
      className="analytics-page"
    >
      <div style={{
        maxWidth: containers.xl,
        margin: '0 auto',
        padding: `${spacing.md} ${spacing.sm}`
      }}>
        {/* Header */}
        <div style={{
          marginBottom: spacing.md,
          paddingBottom: spacing.sm,
          borderBottom: `2px solid ${colors.primary}`
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: spacing.sm
          }}>
            <div>
              <h1 style={{
                color: colors.primary,
                margin: 0,
                fontSize: typography.sizes['2xl'],
                fontWeight: typography.weights.bold
              }}>
                Analytics Dashboard
              </h1>
              <p style={{
                fontSize: typography.sizes.sm,
                color: colors.textSecondary,
                margin: `${spacing['3xs']} 0 0 0`
              }}>
                {branding.brand_name} Performance Metrics
              </p>
            </div>
            <Link
              href={`/${vertical}/admin`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: `${spacing['2xs']} ${spacing.sm}`,
                backgroundColor: colors.primaryDark,
                color: colors.textInverse,
                textDecoration: 'none',
                borderRadius: radius.sm,
                fontWeight: typography.weights.semibold,
                minHeight: 44
              }}
            >
              Back to Admin
            </Link>
          </div>
        </div>

        {/* Admin Navigation */}
        <AdminNav type="vertical" vertical={vertical} />

        {/* Date Range Picker */}
        <div style={{
          marginBottom: spacing.md,
          padding: spacing.sm,
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
          boxShadow: shadows.sm
        }}>
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
          />
        </div>

        {loading && !overview ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 400,
            color: colors.textMuted
          }}>
            Loading analytics...
          </div>
        ) : (
          <>
            {/* Key Metrics */}
            <div className="metrics-grid" style={{
              display: 'grid',
              gap: spacing.sm,
              marginBottom: spacing.md
            }}>
              <MetricCard
                label="Total Revenue"
                value={overview?.totalRevenue || 0}
                format="currency"
                icon="💰"
              />
              <MetricCard
                label="Total Orders"
                value={overview?.totalOrders || 0}
                format="number"
                icon="📦"
              />
              <MetricCard
                label="Active Vendors"
                value={overview?.totalVendors || 0}
                format="number"
                icon="🏪"
              />
              <MetricCard
                label="Published Listings"
                value={overview?.publishedListings || 0}
                format="number"
                icon="📋"
              />
            </div>

            {/* Secondary Metrics */}
            <div className="metrics-grid" style={{
              display: 'grid',
              gap: spacing.sm,
              marginBottom: spacing.md
            }}>
              <MetricCard
                label="Avg Order Value"
                value={overview?.averageOrderValue || 0}
                format="currency"
                icon="📊"
              />
              <MetricCard
                label="Completed Orders"
                value={overview?.completedOrders || 0}
                format="number"
                icon="✅"
              />
              <MetricCard
                label="Pending Orders"
                value={overview?.pendingOrders || 0}
                format="number"
                icon="⏳"
              />
              <MetricCard
                label="Cancelled"
                value={overview?.cancelledOrders || 0}
                format="number"
                icon="❌"
              />
            </div>

            {/* Sales Trend Chart */}
            <div style={{
              marginBottom: spacing.md,
              padding: spacing.sm,
              backgroundColor: colors.surfaceElevated,
              borderRadius: radius.md,
              border: `1px solid ${colors.border}`,
              boxShadow: shadows.sm
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: spacing.sm
              }}>
                <h2 style={{
                  margin: 0,
                  fontSize: typography.sizes.lg,
                  fontWeight: typography.weights.semibold,
                  color: colors.textPrimary
                }}>
                  Sales Trends
                </h2>
                <div style={{ display: 'flex', gap: spacing['2xs'] }}>
                  <button
                    onClick={() => setChartMetric('revenue')}
                    style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      borderRadius: radius.sm,
                      border: 'none',
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      cursor: 'pointer',
                      backgroundColor: chartMetric === 'revenue' ? colors.primary : colors.surfaceMuted,
                      color: chartMetric === 'revenue' ? colors.textInverse : colors.textSecondary
                    }}
                  >
                    Revenue
                  </button>
                  <button
                    onClick={() => setChartMetric('orders')}
                    style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      borderRadius: radius.sm,
                      border: 'none',
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      cursor: 'pointer',
                      backgroundColor: chartMetric === 'orders' ? colors.primary : colors.surfaceMuted,
                      color: chartMetric === 'orders' ? colors.textInverse : colors.textSecondary
                    }}
                  >
                    Orders
                  </button>
                </div>
              </div>
              <SalesChart
                data={trends}
                metric={chartMetric}
                primaryColor={colors.primary}
              />
            </div>

            {/* Two column layout */}
            <div className="bottom-grid" style={{
              display: 'grid',
              gap: spacing.md
            }}>
              {/* Top Vendors */}
              <div style={{
                padding: spacing.sm,
                backgroundColor: colors.surfaceElevated,
                borderRadius: radius.md,
                border: `1px solid ${colors.border}`,
                boxShadow: shadows.sm
              }}>
                <h2 style={{
                  margin: `0 0 ${spacing.sm} 0`,
                  fontSize: typography.sizes.lg,
                  fontWeight: typography.weights.semibold,
                  color: colors.textPrimary
                }}>
                  Top Vendors
                </h2>
                <TopVendorsTable
                  vendors={topVendors}
                  showVertical={false}
                />
              </div>

              {/* Order Status Summary */}
              <div style={{
                padding: spacing.sm,
                backgroundColor: colors.surfaceElevated,
                borderRadius: radius.md,
                border: `1px solid ${colors.border}`,
                boxShadow: shadows.sm
              }}>
                <h2 style={{
                  margin: `0 0 ${spacing.sm} 0`,
                  fontSize: typography.sizes.lg,
                  fontWeight: typography.weights.semibold,
                  color: colors.textPrimary
                }}>
                  Order Status Breakdown
                </h2>

                {overview ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                    {/* Status Cards */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: spacing.xs
                    }}>
                      <div style={{
                        padding: spacing.sm,
                        backgroundColor: '#dcfce7',
                        borderRadius: radius.md,
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: '#166534' }}>
                          {overview.completedOrders}
                        </div>
                        <div style={{ fontSize: typography.sizes.xs, color: '#166534' }}>Completed</div>
                      </div>
                      <div style={{
                        padding: spacing.sm,
                        backgroundColor: '#fef3c7',
                        borderRadius: radius.md,
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: '#92400e' }}>
                          {overview.pendingOrders}
                        </div>
                        <div style={{ fontSize: typography.sizes.xs, color: '#92400e' }}>Pending</div>
                      </div>
                      <div style={{
                        padding: spacing.sm,
                        backgroundColor: '#fee2e2',
                        borderRadius: radius.md,
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: '#dc2626' }}>
                          {overview.cancelledOrders}
                        </div>
                        <div style={{ fontSize: typography.sizes.xs, color: '#dc2626' }}>Cancelled</div>
                      </div>
                    </div>

                    {/* Completion Rate */}
                    <div style={{
                      padding: spacing.sm,
                      backgroundColor: colors.surfaceMuted,
                      borderRadius: radius.md
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span style={{ color: colors.textMuted, fontSize: typography.sizes.sm }}>
                          Completion Rate
                        </span>
                        <span style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary }}>
                          {overview.totalOrders > 0
                            ? `${Math.round((overview.completedOrders / overview.totalOrders) * 100)}%`
                            : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Vertical Summary */}
                    <div style={{
                      padding: spacing.sm,
                      backgroundColor: colors.surfaceMuted,
                      borderRadius: radius.md
                    }}>
                      <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, marginBottom: spacing.xs, color: colors.textSecondary }}>
                        {branding.brand_name} Summary
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: colors.textMuted }}>Total Listings</span>
                          <span style={{ fontWeight: typography.weights.semibold }}>{overview.totalListings}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: colors.textMuted }}>Published</span>
                          <span style={{ fontWeight: typography.weights.semibold }}>{overview.publishedListings}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: colors.textMuted }}>Active Vendors</span>
                          <span style={{ fontWeight: typography.weights.semibold }}>{overview.totalVendors}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: spacing.xl,
                    textAlign: 'center',
                    color: colors.textMuted
                  }}>
                    No order data available
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Responsive Styles */}
      <style>{`
        .analytics-page .metrics-grid {
          grid-template-columns: 1fr;
        }
        .analytics-page .bottom-grid {
          grid-template-columns: 1fr;
        }
        @media (min-width: 640px) {
          .analytics-page .metrics-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .analytics-page .metrics-grid {
            grid-template-columns: repeat(4, 1fr);
          }
          .analytics-page .bottom-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>
    </div>
  )
}
