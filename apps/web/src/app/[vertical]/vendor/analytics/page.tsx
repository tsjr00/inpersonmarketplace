'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
// branding import removed — not currently used on analytics page
import MetricCard from '@/components/analytics/MetricCard'
import SalesChart from '@/components/analytics/SalesChart'
import TopProductsTable from '@/components/analytics/TopProductsTable'
import DateRangePicker from '@/components/analytics/DateRangePicker'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { getFtTierExtras, getFtTierLabel } from '@/lib/vendor-limits'

interface OverviewData {
  totalRevenue: number
  totalOrders: number
  averageOrderValue: number
  completedOrders: number
  pendingOrders: number
  cancelledOrders: number
}

interface TrendData {
  date: string
  revenue: number
  orders: number
}

interface TopProduct {
  listing_id: string
  title: string
  image_url: string | null
  total_sold: number
  revenue: number
}

interface CustomerData {
  totalCustomers: number
  returningCustomers: number
  newCustomers: number
  averageOrdersPerCustomer: number
}

export default function VendorAnalyticsPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params?.vertical as string

  const [vendorId, setVendorId] = useState<string | null>(null)
  const [vendorTier, setVendorTier] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [customers, setCustomers] = useState<CustomerData | null>(null)
  const [chartMetric, setChartMetric] = useState<'revenue' | 'orders'>('revenue')

  // Fetch vendor profile
  useEffect(() => {
    async function fetchVendor() {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push(`/${vertical}/login`)
        return
      }

      const { data: vendorProfile, error: vendorError } = await supabase
        .from('vendor_profiles')
        .select('id, tier')
        .eq('user_id', user.id)
        .eq('vertical_id', vertical)
        .single()

      if (vendorError || !vendorProfile) {
        setError('Vendor profile not found')
        setLoading(false)
        return
      }

      setVendorId(vendorProfile.id)
      setVendorTier(vendorProfile.tier || null)
    }

    fetchVendor()
  }, [vertical, router])

  // Fetch analytics data
  const fetchAnalytics = useCallback(async () => {
    if (!vendorId) return

    setLoading(true)
    const startDate = dateRange.start.toISOString().split('T')[0]
    const endDate = dateRange.end.toISOString().split('T')[0]

    try {
      const [overviewRes, trendsRes, productsRes, customersRes] = await Promise.all([
        fetch(`/api/vendor/analytics/overview?vendor_id=${vendorId}&start_date=${startDate}&end_date=${endDate}`),
        fetch(`/api/vendor/analytics/trends?vendor_id=${vendorId}&start_date=${startDate}&end_date=${endDate}&period=day`),
        fetch(`/api/vendor/analytics/top-products?vendor_id=${vendorId}&start_date=${startDate}&end_date=${endDate}&limit=10`),
        fetch(`/api/vendor/analytics/customers?vendor_id=${vendorId}&start_date=${startDate}&end_date=${endDate}`)
      ])

      if (overviewRes.ok) {
        const data = await overviewRes.json()
        setOverview(data)
      }

      if (trendsRes.ok) {
        const data = await trendsRes.json()
        setTrends(data)
      }

      if (productsRes.ok) {
        const data = await productsRes.json()
        setTopProducts(data)
      }

      if (customersRes.ok) {
        const data = await customersRes.json()
        setCustomers(data)
      }
    } catch (err) {
      console.error('Error fetching analytics:', err)
      setError('Failed to load analytics data')
    } finally {
      setLoading(false)
    }
  }, [vendorId, dateRange])

  useEffect(() => {
    if (vendorId) {
      fetchAnalytics()
    }
  }, [vendorId, fetchAnalytics])

  // Auto-refresh hourly (reduced from 5 min - user can manually refresh if needed)
  // Includes visibility handling to pause when tab is hidden
  useEffect(() => {
    if (!vendorId) return

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
  }, [vendorId, fetchAnalytics])

  // FT tier-based analytics limits
  const isFtVendor = vertical === 'food_trucks'
  const maxDays = isFtVendor && vendorTier ? getFtTierExtras(vendorTier).analyticsDays : undefined
  const canExport = isFtVendor ? vendorTier === 'boss' : true
  const tierLabel = isFtVendor && vendorTier ? getFtTierLabel(vendorTier) : null
  const analyticsBlocked = isFtVendor && maxDays === 0

  if (analyticsBlocked) {
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
            width: 80,
            height: 80,
            backgroundColor: '#FFF3E0',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            fontSize: 36,
          }}>
            📊
          </div>
          <h1 style={{
            fontSize: typography.sizes['2xl'],
            fontWeight: typography.weights.bold,
            color: colors.textPrimary,
            margin: '0 0 12px 0',
          }}>
            Analytics Not Available
          </h1>
          <p style={{
            fontSize: typography.sizes.base,
            color: colors.textMuted,
            margin: '0 0 32px 0',
            lineHeight: 1.6,
          }}>
            Upgrade to a paid plan to unlock analytics and track your sales, customers, and product performance.
          </p>
          <Link
            href={`/${vertical}/vendor/dashboard/upgrade`}
            style={{
              display: 'inline-block',
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: '#E53935',
              color: 'white',
              textDecoration: 'none',
              borderRadius: radius.md,
              fontWeight: typography.weights.semibold,
              fontSize: typography.sizes.base,
            }}
          >
            View Plans
          </Link>
          <div style={{ marginTop: spacing.sm }}>
            <Link
              href={`/${vertical}/vendor/dashboard`}
              style={{
                color: colors.textMuted,
                textDecoration: 'none',
                fontSize: typography.sizes.sm,
              }}
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
            href={`/${vertical}/vendor/dashboard`}
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
            Back to Dashboard
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
            </div>
            <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
              {canExport && (
                <button
                  onClick={() => {
                    // MVP: gate only — CSV generation is a follow-up
                    alert('Export feature coming soon!')
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: `${spacing['2xs']} ${spacing.sm}`,
                    backgroundColor: colors.surfaceMuted,
                    color: colors.textPrimary,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.sm,
                    fontWeight: typography.weights.semibold,
                    minHeight: 44,
                    cursor: 'pointer',
                    fontSize: typography.sizes.sm
                  }}
                >
                  Export CSV
                </button>
              )}
              <Link
                href={`/${vertical}/vendor/dashboard`}
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
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>

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
            maxDays={maxDays}
          />
          {isFtVendor && maxDays && maxDays < 90 && (
            <div style={{
              marginTop: spacing.xs,
              padding: `${spacing['2xs']} ${spacing.sm}`,
              backgroundColor: '#FFF3E0',
              borderRadius: radius.sm,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: spacing.xs
            }}>
              <span style={{ fontSize: typography.sizes.sm, color: '#E65100' }}>
                {tierLabel} plan: {maxDays}-day analytics limit
              </span>
              <Link
                href={`/${vertical}/vendor/dashboard/upgrade`}
                style={{
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold,
                  color: '#E53935',
                  textDecoration: 'none'
                }}
              >
                Upgrade for 90-day analytics →
              </Link>
            </div>
          )}
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
            {/* Metric Cards */}
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
                label="Avg Order Value"
                value={overview?.averageOrderValue || 0}
                format="currency"
                icon="📊"
              />
              <MetricCard
                label="Customers"
                value={customers?.totalCustomers || 0}
                format="number"
                icon="👥"
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

            {/* Two column layout for products and customers */}
            <div className="bottom-grid" style={{
              display: 'grid',
              gap: spacing.md
            }}>
              {/* Top Products */}
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
                  Top Products
                </h2>
                <TopProductsTable
                  products={topProducts}
                  onProductClick={(listingId) => {
                    router.push(`/${vertical}/listing/${listingId}`)
                  }}
                />
              </div>

              {/* Customer Insights */}
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
                  Customer Insights
                </h2>

                {customers ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                    {/* Customer Stats */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: spacing.xs
                    }}>
                      <div style={{
                        padding: spacing.sm,
                        backgroundColor: colors.primaryLight,
                        borderRadius: radius.md,
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.primaryDark }}>
                          {customers.newCustomers}
                        </div>
                        <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>New Customers</div>
                      </div>
                      <div style={{
                        padding: spacing.sm,
                        backgroundColor: colors.surfaceSubtle,
                        borderRadius: radius.md,
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.primary }}>
                          {customers.returningCustomers}
                        </div>
                        <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>Returning</div>
                      </div>
                    </div>

                    {/* Order Frequency */}
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
                          Avg Orders per Customer
                        </span>
                        <span style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.textPrimary }}>
                          {customers.averageOrdersPerCustomer}
                        </span>
                      </div>
                    </div>

                    {/* Order Status Breakdown */}
                    {overview && (
                      <div style={{
                        padding: spacing.sm,
                        backgroundColor: colors.surfaceMuted,
                        borderRadius: radius.md
                      }}>
                        <div style={{ fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, marginBottom: spacing.xs, color: colors.textSecondary }}>
                          Order Status
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: colors.primaryDark }}>Completed</span>
                            <span style={{ fontWeight: typography.weights.semibold }}>{overview.completedOrders}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: colors.accent }}>Pending</span>
                            <span style={{ fontWeight: typography.weights.semibold }}>{overview.pendingOrders}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#dc2626' }}>Cancelled</span>
                            <span style={{ fontWeight: typography.weights.semibold }}>{overview.cancelledOrders}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{
                    padding: spacing.xl,
                    textAlign: 'center',
                    color: colors.textMuted
                  }}>
                    No customer data available
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
