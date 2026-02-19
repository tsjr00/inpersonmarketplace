'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'

interface OrderItem {
  id: string
  listing_id: string
  listing_title: string
  listing_image: string | null
  quantity: number
  unit_price_cents: number
  subtotal_cents: number
  status: string
  pickup_date: string | null
}

interface Order {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string | null
  created_at: string
  items: OrderItem[]
}

interface PrepSheetItem {
  listing_id: string
  title: string
  image: string | null
  total_quantity: number
  order_count: number
}

interface PrepData {
  market: {
    id: string
    name: string
    market_type: string
    address: string
    city: string
    state: string
  }
  nextPickup: {
    date: string
    day_of_week: number
    start_time: string
    end_time: string
  } | null
  summary: {
    total_orders: number
    total_items: number
    total_quantity: number
    total_revenue_cents: number
  }
  orders: Order[]
  prepSheet: PrepSheetItem[]
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  })
}

export default function VendorPrepPage() {
  const params = useParams()
  const vertical = params.vertical as string
  const marketId = params.id as string
  const printRef = useRef<HTMLDivElement>(null)

  const [data, setData] = useState<PrepData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'prepsheet' | 'orders'>('prepsheet')

  useEffect(() => {
    if (marketId) {
      fetchPrepData()
    }
  }, [marketId])

  const fetchPrepData = async () => {
    try {
      const res = await fetch(`/api/vendor/markets/${marketId}/prep`, {
        credentials: 'include'
      })
      if (res.ok) {
        const prepData = await res.json()
        setData(prepData)
      } else {
        console.error('Prep API error:', res.status, await res.text())
      }
    } catch (error) {
      console.error('Error fetching prep data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceBase
      }}>
        <p>Loading prep data...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceBase
      }}>
        <p>Failed to load prep data</p>
      </div>
    )
  }

  return (
    <>
      <div style={{
        minHeight: '100vh',
        backgroundColor: colors.surfaceBase,
        color: colors.textPrimary
      }}>
        {/* Header */}
        <div style={{
          backgroundColor: colors.surfaceElevated,
          borderBottom: `1px solid ${colors.border}`,
          padding: `${spacing.sm} ${spacing.md}`,
          position: 'sticky',
          top: 0,
          zIndex: 50
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: spacing.sm,
            flexWrap: 'wrap'
          }}>
            <div>
              <Link
                href={`/${vertical}/vendor/dashboard`}
                style={{
                  fontSize: typography.sizes.xs,
                  color: colors.textSecondary,
                  textDecoration: 'none',
                  display: 'inline-block',
                  marginBottom: spacing['3xs']
                }}
              >
                &larr; Back to Dashboard
              </Link>
              <h1 style={{
                margin: 0,
                fontSize: typography.sizes.xl,
                fontWeight: typography.weights.bold,
                color: colors.primary
              }}>
                {vertical === 'food_trucks' ? 'Prep for Service' : 'Prep for Market'}
              </h1>
              <p style={{
                margin: `${spacing['3xs']} 0 0 0`,
                fontSize: typography.sizes.sm,
                color: colors.textSecondary
              }}>
                {data.market.name}
              </p>
            </div>

            <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
              <button
                onClick={handlePrint}
                className="no-print"
                style={{
                  padding: `${spacing.xs} ${spacing.sm}`,
                  backgroundColor: colors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing['3xs']
                }}
              >
                <span>🖨️</span> Print Prep Sheet
              </button>
              <Link
                href={`/${vertical}/vendor/pickup`}
                className="no-print"
                style={{
                  padding: `${spacing.xs} ${spacing.sm}`,
                  backgroundColor: '#111827',
                  color: 'white',
                  border: 'none',
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing['3xs']
                }}
              >
                <span>📱</span> Pickup Mode
              </Link>
            </div>
          </div>
        </div>

        {/* Next Pickup Banner */}
        {data.nextPickup && (
          <div style={{
            backgroundColor: colors.primaryLight,
            borderBottom: `1px solid ${colors.primary}`,
            padding: `${spacing.sm} ${spacing.md}`,
            textAlign: 'center'
          }}>
            <p style={{
              margin: 0,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              color: colors.primaryDark
            }}>
              Next {term(vertical, 'market')}: {formatDate(data.nextPickup.date)}
              <span style={{ fontWeight: typography.weights.normal, marginLeft: spacing.xs }}>
                {data.nextPickup.start_time} - {data.nextPickup.end_time}
              </span>
            </p>
          </div>
        )}

        {/* Summary Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: spacing.sm,
          padding: spacing.md,
          backgroundColor: colors.surfaceElevated,
          borderBottom: `1px solid ${colors.border}`
        }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.primary }}>
              {data.summary.total_orders}
            </p>
            <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textSecondary }}>Orders</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.primary }}>
              {data.summary.total_items}
            </p>
            <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textSecondary }}>Line Items</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.primary }}>
              {data.summary.total_quantity}
            </p>
            <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textSecondary }}>Total Qty</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.accent }}>
              {formatPrice(data.summary.total_revenue_cents)}
            </p>
            <p style={{ margin: 0, fontSize: typography.sizes.xs, color: colors.textSecondary }}>Revenue</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="no-print" style={{
          display: 'flex',
          gap: spacing.xs,
          padding: `${spacing.sm} ${spacing.md}`,
          borderBottom: `1px solid ${colors.border}`,
          backgroundColor: colors.surfaceBase
        }}>
          <button
            onClick={() => setActiveTab('prepsheet')}
            style={{
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: activeTab === 'prepsheet' ? colors.primary : 'transparent',
              color: activeTab === 'prepsheet' ? 'white' : colors.textSecondary,
              border: `1px solid ${activeTab === 'prepsheet' ? colors.primary : colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              cursor: 'pointer'
            }}
          >
            Prep Sheet
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            style={{
              padding: `${spacing.xs} ${spacing.md}`,
              backgroundColor: activeTab === 'orders' ? colors.primary : 'transparent',
              color: activeTab === 'orders' ? 'white' : colors.textSecondary,
              border: `1px solid ${activeTab === 'orders' ? colors.primary : colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              cursor: 'pointer'
            }}
          >
            Order Details ({data.orders.length})
          </button>
        </div>

        {/* Content */}
        <div ref={printRef} style={{ padding: spacing.md }}>
          {/* Prep Sheet Tab */}
          {(activeTab === 'prepsheet' || true) && (
            <div className={activeTab === 'prepsheet' ? '' : 'print-only'} style={{
              display: activeTab === 'prepsheet' ? 'block' : 'none'
            }}>
              {data.prepSheet.length === 0 ? (
                <div style={{
                  padding: spacing.xl,
                  textAlign: 'center',
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: radius.md,
                  border: `1px solid ${colors.border}`
                }}>
                  <p style={{ color: colors.textSecondary, margin: 0 }}>
                    No orders to prepare for this market yet.
                  </p>
                </div>
              ) : (
                <div style={{
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: radius.md,
                  border: `1px solid ${colors.border}`,
                  overflow: 'hidden'
                }}>
                  {/* Print Header - only visible when printing */}
                  <div className="print-only" style={{ padding: spacing.md, borderBottom: `1px solid ${colors.border}` }}>
                    <h2 style={{ margin: 0, fontSize: typography.sizes.lg }}>
                      Prep Sheet: {data.market.name}
                    </h2>
                    {data.nextPickup && (
                      <p style={{ margin: `${spacing['3xs']} 0 0 0`, color: colors.textSecondary }}>
                        {formatDate(data.nextPickup.date)} - {data.nextPickup.start_time} to {data.nextPickup.end_time}
                      </p>
                    )}
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: colors.surfaceSubtle }}>
                        <th style={{
                          textAlign: 'left',
                          padding: spacing.sm,
                          fontSize: typography.sizes.sm,
                          fontWeight: typography.weights.semibold,
                          color: colors.textSecondary,
                          borderBottom: `1px solid ${colors.border}`
                        }}>
                          Product
                        </th>
                        <th style={{
                          textAlign: 'center',
                          padding: spacing.sm,
                          fontSize: typography.sizes.sm,
                          fontWeight: typography.weights.semibold,
                          color: colors.textSecondary,
                          borderBottom: `1px solid ${colors.border}`,
                          width: 120
                        }}>
                          Total Qty
                        </th>
                        <th style={{
                          textAlign: 'center',
                          padding: spacing.sm,
                          fontSize: typography.sizes.sm,
                          fontWeight: typography.weights.semibold,
                          color: colors.textSecondary,
                          borderBottom: `1px solid ${colors.border}`,
                          width: 100
                        }}>
                          # Orders
                        </th>
                        <th className="no-print" style={{
                          textAlign: 'center',
                          padding: spacing.sm,
                          fontSize: typography.sizes.sm,
                          fontWeight: typography.weights.semibold,
                          color: colors.textSecondary,
                          borderBottom: `1px solid ${colors.border}`,
                          width: 60
                        }}>
                          Done
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.prepSheet.map((item, index) => (
                        <tr key={item.listing_id} style={{
                          borderBottom: index < data.prepSheet.length - 1 ? `1px solid ${colors.border}` : 'none'
                        }}>
                          <td style={{ padding: spacing.sm }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                              {item.image && (
                                <img
                                  src={item.image}
                                  alt=""
                                  style={{
                                    width: 48,
                                    height: 48,
                                    objectFit: 'cover',
                                    borderRadius: radius.sm
                                  }}
                                  className="no-print"
                                />
                              )}
                              <span style={{
                                fontSize: typography.sizes.base,
                                fontWeight: typography.weights.medium
                              }}>
                                {item.title}
                              </span>
                            </div>
                          </td>
                          <td style={{
                            padding: spacing.sm,
                            textAlign: 'center',
                            fontSize: typography.sizes.xl,
                            fontWeight: typography.weights.bold,
                            color: colors.primary
                          }}>
                            {item.total_quantity}
                          </td>
                          <td style={{
                            padding: spacing.sm,
                            textAlign: 'center',
                            fontSize: typography.sizes.sm,
                            color: colors.textSecondary
                          }}>
                            {item.order_count}
                          </td>
                          <td className="no-print" style={{
                            padding: spacing.sm,
                            textAlign: 'center'
                          }}>
                            <input
                              type="checkbox"
                              style={{
                                width: 24,
                                height: 24,
                                cursor: 'pointer'
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Orders Tab */}
          {activeTab === 'orders' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
              {data.orders.length === 0 ? (
                <div style={{
                  padding: spacing.xl,
                  textAlign: 'center',
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: radius.md,
                  border: `1px solid ${colors.border}`
                }}>
                  <p style={{ color: colors.textSecondary, margin: 0 }}>
                    No orders for this market yet.
                  </p>
                </div>
              ) : (
                data.orders.map(order => (
                  <div
                    key={order.id}
                    style={{
                      backgroundColor: colors.surfaceElevated,
                      borderRadius: radius.md,
                      border: `1px solid ${colors.border}`,
                      overflow: 'hidden'
                    }}
                  >
                    {/* Order Header */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: spacing.sm,
                      backgroundColor: colors.surfaceSubtle,
                      borderBottom: `1px solid ${colors.border}`
                    }}>
                      <div>
                        <span style={{
                          fontSize: typography.sizes.base,
                          fontWeight: typography.weights.bold,
                          fontFamily: 'monospace'
                        }}>
                          #{order.order_number}
                        </span>
                        <span style={{
                          marginLeft: spacing.sm,
                          fontSize: typography.sizes.sm,
                          color: colors.textSecondary
                        }}>
                          {order.customer_name}
                        </span>
                        {order.customer_phone && (
                          <span style={{
                            marginLeft: spacing.xs,
                            fontSize: typography.sizes.xs,
                            color: colors.textMuted
                          }}>
                            ({order.customer_phone})
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontSize: typography.sizes.xs,
                        color: colors.textMuted
                      }}>
                        {new Date(order.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Order Items */}
                    <div style={{ padding: spacing.sm }}>
                      {order.items.map((item, idx) => (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: `${spacing.xs} 0`,
                            borderBottom: idx < order.items.length - 1 ? `1px solid ${colors.border}` : 'none'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                            {item.listing_image && (
                              <img
                                src={item.listing_image}
                                alt=""
                                style={{
                                  width: 40,
                                  height: 40,
                                  objectFit: 'cover',
                                  borderRadius: radius.sm
                                }}
                              />
                            )}
                            <div>
                              <p style={{
                                margin: 0,
                                fontSize: typography.sizes.sm,
                                fontWeight: typography.weights.medium
                              }}>
                                {item.listing_title}
                              </p>
                              <p style={{
                                margin: 0,
                                fontSize: typography.sizes.xs,
                                color: colors.textSecondary
                              }}>
                                {formatPrice(item.unit_price_cents)} each
                              </p>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{
                              margin: 0,
                              fontSize: typography.sizes.lg,
                              fontWeight: typography.weights.bold,
                              color: colors.primary
                            }}>
                              x{item.quantity}
                            </p>
                            <p style={{
                              margin: 0,
                              fontSize: typography.sizes.xs,
                              color: colors.textSecondary
                            }}>
                              {formatPrice(item.subtotal_cents)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
        @media screen {
          .print-only {
            display: none !important;
          }
        }
      `}</style>
    </>
  )
}
