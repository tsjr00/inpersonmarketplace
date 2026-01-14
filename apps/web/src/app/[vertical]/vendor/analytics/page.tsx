'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { defaultBranding } from '@/lib/branding'
import MetricCard from '@/components/analytics/MetricCard'
import SalesChart from '@/components/analytics/SalesChart'
import TopProductsTable from '@/components/analytics/TopProductsTable'
import DateRangePicker from '@/components/analytics/DateRangePicker'

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

  // Get branding
  const branding = defaultBranding[vertical] || defaultBranding.fireworks

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

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (!vendorId) return

    const interval = setInterval(() => {
      fetchAnalytics()
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [vendorId, fetchAnalytics])

  if (error) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: branding.colors.background,
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
              marginTop: 16,
              padding: '10px 20px',
              backgroundColor: branding.colors.primary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6
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
        backgroundColor: branding.colors.background,
        color: branding.colors.text
      }}
      className="analytics-page"
    >
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '24px 16px'
      }}>
        {/* Header */}
        <div style={{
          marginBottom: 24,
          paddingBottom: 16,
          borderBottom: `2px solid ${branding.colors.primary}`
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 16
          }}>
            <div>
              <h1 style={{
                color: branding.colors.primary,
                margin: 0,
                fontSize: 28,
                fontWeight: 'bold'
              }}>
                Analytics Dashboard
              </h1>
              <p style={{
                fontSize: 14,
                color: branding.colors.secondary,
                margin: '4px 0 0 0'
              }}>
                {branding.brand_name}
              </p>
            </div>
            <Link
              href={`/${vertical}/vendor/dashboard`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '10px 20px',
                backgroundColor: branding.colors.secondary,
                color: 'white',
                textDecoration: 'none',
                borderRadius: 6,
                fontWeight: 600,
                minHeight: 44
              }}
            >
              Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Date Range Picker */}
        <div style={{
          marginBottom: 24,
          padding: 16,
          backgroundColor: 'white',
          borderRadius: 8,
          border: '1px solid #e5e7eb'
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
            color: '#6b7280'
          }}>
            Loading analytics...
          </div>
        ) : (
          <>
            {/* Metric Cards */}
            <div className="metrics-grid" style={{
              display: 'grid',
              gap: 16,
              marginBottom: 24
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
              marginBottom: 24,
              padding: 20,
              backgroundColor: 'white',
              borderRadius: 8,
              border: '1px solid #e5e7eb'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16
              }}>
                <h2 style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 600,
                  color: '#111827'
                }}>
                  Sales Trends
                </h2>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setChartMetric('revenue')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 4,
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      backgroundColor: chartMetric === 'revenue' ? branding.colors.primary : '#e5e7eb',
                      color: chartMetric === 'revenue' ? 'white' : '#374151'
                    }}
                  >
                    Revenue
                  </button>
                  <button
                    onClick={() => setChartMetric('orders')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 4,
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      backgroundColor: chartMetric === 'orders' ? branding.colors.primary : '#e5e7eb',
                      color: chartMetric === 'orders' ? 'white' : '#374151'
                    }}
                  >
                    Orders
                  </button>
                </div>
              </div>
              <SalesChart
                data={trends}
                metric={chartMetric}
                primaryColor={branding.colors.primary}
              />
            </div>

            {/* Two column layout for products and customers */}
            <div className="bottom-grid" style={{
              display: 'grid',
              gap: 24
            }}>
              {/* Top Products */}
              <div style={{
                padding: 20,
                backgroundColor: 'white',
                borderRadius: 8,
                border: '1px solid #e5e7eb'
              }}>
                <h2 style={{
                  margin: '0 0 16px 0',
                  fontSize: 18,
                  fontWeight: 600,
                  color: '#111827'
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
                padding: 20,
                backgroundColor: 'white',
                borderRadius: 8,
                border: '1px solid #e5e7eb'
              }}>
                <h2 style={{
                  margin: '0 0 16px 0',
                  fontSize: 18,
                  fontWeight: 600,
                  color: '#111827'
                }}>
                  Customer Insights
                </h2>

                {customers ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Customer Stats */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: 12
                    }}>
                      <div style={{
                        padding: 16,
                        backgroundColor: '#f0fdf4',
                        borderRadius: 8,
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#059669' }}>
                          {customers.newCustomers}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>New Customers</div>
                      </div>
                      <div style={{
                        padding: 16,
                        backgroundColor: '#eff6ff',
                        borderRadius: 8,
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#2563eb' }}>
                          {customers.returningCustomers}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>Returning</div>
                      </div>
                    </div>

                    {/* Order Frequency */}
                    <div style={{
                      padding: 16,
                      backgroundColor: '#f9fafb',
                      borderRadius: 8
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span style={{ color: '#6b7280', fontSize: 14 }}>
                          Avg Orders per Customer
                        </span>
                        <span style={{ fontSize: 18, fontWeight: 'bold', color: '#111827' }}>
                          {customers.averageOrdersPerCustomer}
                        </span>
                      </div>
                    </div>

                    {/* Order Status Breakdown */}
                    {overview && (
                      <div style={{
                        padding: 16,
                        backgroundColor: '#f9fafb',
                        borderRadius: 8
                      }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#374151' }}>
                          Order Status
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#059669' }}>Completed</span>
                            <span style={{ fontWeight: 600 }}>{overview.completedOrders}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#d97706' }}>Pending</span>
                            <span style={{ fontWeight: 600 }}>{overview.pendingOrders}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#dc2626' }}>Cancelled</span>
                            <span style={{ fontWeight: 600 }}>{overview.cancelledOrders}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{
                    padding: 40,
                    textAlign: 'center',
                    color: '#6b7280'
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
