'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
// branding import removed — not currently used on analytics page
import MetricCard from '@/components/analytics/MetricCard'
import dynamic from 'next/dynamic'
const SalesChart = dynamic(() => import('@/components/analytics/SalesChart'), { ssr: false })
import TopProductsTable from '@/components/analytics/TopProductsTable'
import DateRangePicker from '@/components/analytics/DateRangePicker'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { getAnalyticsLimits, getVendorTierLabel } from '@/lib/vendor-limits'

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

interface TaxSummaryData {
  totalSalesCents: number
  taxableSalesCents: number
  nonTaxableSalesCents: number
  totalOrderCount: number
  taxableOrderCount: number
  nonTaxableOrderCount: number
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
  const [taxSummary, setTaxSummary] = useState<TaxSummaryData | null>(null)
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
      const [overviewRes, trendsRes, productsRes, customersRes, taxRes] = await Promise.all([
        fetch(`/api/vendor/analytics/overview?vendor_id=${vendorId}&start_date=${startDate}&end_date=${endDate}`),
        fetch(`/api/vendor/analytics/trends?vendor_id=${vendorId}&start_date=${startDate}&end_date=${endDate}&period=day`),
        fetch(`/api/vendor/analytics/top-products?vendor_id=${vendorId}&start_date=${startDate}&end_date=${endDate}&limit=10`),
        fetch(`/api/vendor/analytics/customers?vendor_id=${vendorId}&start_date=${startDate}&end_date=${endDate}`),
        fetch(`/api/vendor/analytics/tax-summary?vendor_id=${vendorId}&start_date=${startDate}&end_date=${endDate}`)
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

      if (taxRes.ok) {
        const data = await taxRes.json()
        setTaxSummary(data)
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

  // Tier-based analytics limits (both verticals)
  const analyticsConfig = getAnalyticsLimits(vendorTier || 'free', vertical)
  const maxDays = analyticsConfig.analyticsDays
  const canExport = analyticsConfig.analyticsExport
  const tierLabel = getVendorTierLabel(vendorTier || 'free', vertical)
  const analyticsBlocked = maxDays === 0

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
              backgroundColor: 'transparent',
              color: '#737373',
              textDecoration: 'none',
              borderRadius: radius.sm,
              border: '2px solid #737373'
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
                    const rows: string[] = []
                    const startStr = dateRange.start.toISOString().slice(0, 10)
                    const endStr = dateRange.end.toISOString().slice(0, 10)
                    rows.push(`Analytics Export,${startStr} to ${endStr}`)
                    rows.push('')
                    if (overview) {
                      rows.push('Summary')
                      rows.push(`Total Revenue,$${(overview.totalRevenue / 100).toFixed(2)}`)
                      rows.push(`Total Orders,${overview.totalOrders}`)
                      rows.push(`Average Order,$${(overview.averageOrderValue / 100).toFixed(2)}`)
                      rows.push(`Completed,${overview.completedOrders}`)
                      rows.push(`Pending,${overview.pendingOrders}`)
                      rows.push(`Cancelled,${overview.cancelledOrders}`)
                      rows.push('')
                    }
                    if (topProducts.length > 0) {
                      rows.push('Top Products')
                      rows.push('Product,Orders,Revenue')
                      topProducts.forEach(p => {
                        const name = p.title.replace(/,/g, ' ')
                        rows.push(`${name},${p.total_sold},$${(p.revenue / 100).toFixed(2)}`)
                      })
                      rows.push('')
                    }
                    if (trends.length > 0) {
                      rows.push('Daily Trends')
                      rows.push('Date,Revenue,Orders')
                      trends.forEach(t => {
                        rows.push(`${t.date},$${(t.revenue / 100).toFixed(2)},${t.orders}`)
                      })
                      rows.push('')
                    }
                    if (taxSummary && taxSummary.totalOrderCount > 0) {
                      rows.push('Sales Tax Summary')
                      rows.push(`Total Sales,$${(taxSummary.totalSalesCents / 100).toFixed(2)},${taxSummary.totalOrderCount} orders`)
                      rows.push(`Taxable Sales,$${(taxSummary.taxableSalesCents / 100).toFixed(2)},${taxSummary.taxableOrderCount} orders`)
                      rows.push(`Non-Taxable Sales,$${(taxSummary.nonTaxableSalesCents / 100).toFixed(2)},${taxSummary.nonTaxableOrderCount} orders`)
                    }
                    const csv = rows.join('\n')
                    const blob = new Blob([csv], { type: 'text/csv' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `analytics-${startStr}-to-${endStr}.csv`
                    a.click()
                    URL.revokeObjectURL(url)
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
            customEnabled={maxDays >= 60}
          />
          {maxDays > 0 && maxDays < 90 && (
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
                  color: '#ff3131',
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
                    router.push(`/${vertical}/vendor/listings/${listingId}/edit`)
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
            {/* Sales Tax Summary — available to ALL tiers */}
            <div style={{
              marginTop: spacing.md,
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
                  Sales Tax Summary
                </h2>
                <Link
                  href={`/${vertical}/help?q=Sales+Tax`}
                  style={{
                    fontSize: typography.sizes.xs,
                    color: colors.textMuted,
                    textDecoration: 'none',
                  }}
                >
                  Learn more →
                </Link>
              </div>

              {taxSummary && taxSummary.totalOrderCount > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                  {/* Summary cards */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: spacing.xs
                  }}>
                    <div style={{
                      padding: spacing.sm,
                      backgroundColor: colors.surfaceMuted,
                      borderRadius: radius.md,
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary }}>
                        ${(taxSummary.totalSalesCents / 100).toFixed(2)}
                      </div>
                      <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>Total Sales</div>
                    </div>
                    <div style={{
                      padding: spacing.sm,
                      backgroundColor: '#fef3c7',
                      borderRadius: radius.md,
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: '#92400e' }}>
                        ${(taxSummary.taxableSalesCents / 100).toFixed(2)}
                      </div>
                      <div style={{ fontSize: typography.sizes.xs, color: '#92400e' }}>Taxable Sales</div>
                    </div>
                    <div style={{
                      padding: spacing.sm,
                      backgroundColor: colors.primaryLight,
                      borderRadius: radius.md,
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.primaryDark }}>
                        ${(taxSummary.nonTaxableSalesCents / 100).toFixed(2)}
                      </div>
                      <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>Non-Taxable</div>
                    </div>
                  </div>

                  {/* Breakdown bar */}
                  {taxSummary.totalSalesCents > 0 && (
                    <div>
                      <div style={{
                        display: 'flex',
                        height: 12,
                        borderRadius: 6,
                        overflow: 'hidden',
                        backgroundColor: colors.surfaceMuted
                      }}>
                        <div style={{
                          width: `${(taxSummary.taxableSalesCents / taxSummary.totalSalesCents) * 100}%`,
                          backgroundColor: '#f59e0b',
                          transition: 'width 0.3s'
                        }} />
                        <div style={{
                          flex: 1,
                          backgroundColor: colors.primary,
                          opacity: 0.3
                        }} />
                      </div>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: spacing['3xs'],
                        fontSize: typography.sizes.xs,
                        color: colors.textMuted
                      }}>
                        <span>Taxable: {((taxSummary.taxableSalesCents / taxSummary.totalSalesCents) * 100).toFixed(1)}% ({taxSummary.taxableOrderCount} orders)</span>
                        <span>Non-taxable: {((taxSummary.nonTaxableSalesCents / taxSummary.totalSalesCents) * 100).toFixed(1)}% ({taxSummary.nonTaxableOrderCount} orders)</span>
                      </div>
                    </div>
                  )}

                  <p style={{
                    margin: 0,
                    fontSize: typography.sizes.xs,
                    color: colors.textMuted,
                    padding: spacing['2xs'],
                    backgroundColor: colors.surfaceMuted,
                    borderRadius: radius.sm
                  }}>
                    This report is for your records only. You are responsible for collecting and remitting sales tax. The platform does not collect tax on your behalf.
                  </p>
                </div>
              ) : (
                <div style={{
                  padding: spacing.md,
                  textAlign: 'center',
                  color: colors.textMuted
                }}>
                  <p style={{ margin: `0 0 ${spacing.xs} 0`, fontSize: typography.sizes.sm }}>
                    {taxSummary && taxSummary.totalOrderCount === 0
                      ? 'No completed orders in this date range.'
                      : 'Mark items as taxable in your listings to see a breakdown here.'}
                  </p>
                  <Link
                    href={`/${vertical}/vendor/listings`}
                    style={{
                      fontSize: typography.sizes.sm,
                      color: colors.primary,
                      textDecoration: 'none',
                      fontWeight: typography.weights.medium
                    }}
                  >
                    Go to Listings →
                  </Link>
                </div>
              )}
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
