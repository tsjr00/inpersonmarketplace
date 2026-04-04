'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { spacing, typography, radius, statusColors } from '@/lib/design-tokens'
import { formatPrice } from '@/lib/pricing'

interface WaveData {
  id: string
  wave_number: number
  start_time: string
  end_time: string
  capacity: number
  reserved_count: number
}

interface ItemCount {
  title: string
  total: number
  byWave: Record<string, number>
}

interface WaveOrder {
  order_number: string
  item_title: string
  quantity: number
  status: string
  fulfilled: boolean
  pickup_time: string | null
  order_id: string
}

interface PrepData {
  event: {
    company_name: string
    event_date: string
    event_start_time: string | null
    event_end_time: string | null
    headcount: number
    address: string | null
    city: string
    state: string
  } | null
  waves: WaveData[]
  waveOrderingEnabled: boolean
  itemCounts: ItemCount[]
  ordersByWave: Record<string, WaveOrder[]>
  summary: {
    totalOrders: number
    totalItems: number
    fulfilledCount: number
    remainingCount: number
    totalRevenueCents: number
    maxOrdersPerWave: number | null
    maxOrdersTotal: number | null
  }
}

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export default function VendorEventPrepPage() {
  const params = useParams()
  const vertical = params.vertical as string
  const marketId = params.marketId as string
  const accent = vertical === 'food_trucks' ? '#ff5757' : '#2d5016'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PrepData | null>(null)
  const [activeWaveTab, setActiveWaveTab] = useState<string>('all')

  useEffect(() => {
    async function fetchPrep() {
      try {
        const res = await fetch(`/api/vendor/events/${marketId}/prep`)
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: '' }))
          setError(err.error || 'Unable to load prep sheet')
          return
        }
        setData(await res.json())
      } catch {
        setError('Connection error')
      } finally {
        setLoading(false)
      }
    }
    fetchPrep()
  }, [marketId])

  if (loading) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ color: statusColors.neutral500 }}>Loading prep sheet...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ color: statusColors.danger }}>{error || 'Not found'}</p>
        <Link href={`/${vertical}/vendor/dashboard`} style={{ color: accent, fontSize: typography.sizes.sm }}>
          Back to Dashboard
        </Link>
      </div>
    )
  }

  const { event, waves, waveOrderingEnabled, itemCounts, ordersByWave, summary } = data

  // Get orders for selected wave tab
  const displayOrders = activeWaveTab === 'all'
    ? Object.values(ordersByWave).flat()
    : ordersByWave[activeWaveTab] || []

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: `${spacing.md} ${spacing.sm}` }}>

      {/* Header */}
      {event && (
        <div style={{
          padding: spacing.sm,
          backgroundColor: accent,
          color: 'white',
          borderRadius: radius.lg,
          marginBottom: spacing.md,
        }}>
          <h1 style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, margin: `0 0 ${spacing['3xs']}` }}>
            Prep Sheet: {event.company_name}
          </h1>
          <p style={{ fontSize: typography.sizes.sm, margin: 0, opacity: 0.9 }}>
            {fmtDate(event.event_date)}
            {event.event_start_time && event.event_end_time && (
              <> &middot; {formatTime(event.event_start_time)} &ndash; {formatTime(event.event_end_time)}</>
            )}
            &middot; {event.headcount} guests
          </p>
          <p style={{ fontSize: typography.sizes.xs, margin: `${spacing['3xs']} 0 0`, opacity: 0.8 }}>
            {event.address ? `${event.address}, ` : ''}{event.city}, {event.state}
          </p>
        </div>
      )}

      {/* Summary Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: spacing.xs,
        marginBottom: spacing.md,
      }}>
        {[
          { label: 'Orders', value: summary.totalOrders },
          { label: 'Items', value: summary.totalItems },
          { label: 'Fulfilled', value: summary.fulfilledCount },
          { label: 'Remaining', value: summary.remainingCount },
        ].map(stat => (
          <div key={stat.label} style={{
            textAlign: 'center',
            padding: spacing.xs,
            backgroundColor: 'white',
            border: `1px solid ${statusColors.neutral200}`,
            borderRadius: radius.md,
          }}>
            <div style={{ fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: accent }}>
              {stat.value}
            </div>
            <div style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Item Counts — "What to Prep" */}
      <div style={{
        backgroundColor: 'white',
        border: `1px solid ${statusColors.neutral200}`,
        borderRadius: radius.lg,
        overflow: 'hidden',
        marginBottom: spacing.md,
      }}>
        <div style={{
          padding: `${spacing.xs} ${spacing.sm}`,
          backgroundColor: statusColors.neutral50,
          borderBottom: `1px solid ${statusColors.neutral200}`,
        }}>
          <h2 style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: statusColors.neutral800, margin: 0 }}>
            What to Prep
          </h2>
          <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: `2px 0 0` }}>
            Total item counts{waveOrderingEnabled ? ' broken down by wave' : ''}
          </p>
        </div>
        <div style={{ padding: spacing.sm }}>
          {itemCounts.length === 0 ? (
            <p style={{ color: statusColors.neutral400, fontSize: typography.sizes.sm, margin: 0, textAlign: 'center', padding: spacing.sm }}>
              No orders yet
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: `${spacing['3xs']} ${spacing.xs}`, fontSize: typography.sizes.xs, color: statusColors.neutral500, borderBottom: `1px solid ${statusColors.neutral200}` }}>
                    Item
                  </th>
                  {waveOrderingEnabled && waves.map(w => (
                    <th key={w.id} style={{ textAlign: 'center', padding: `${spacing['3xs']} ${spacing.xs}`, fontSize: typography.sizes.xs, color: statusColors.neutral500, borderBottom: `1px solid ${statusColors.neutral200}` }}>
                      W{w.wave_number}
                    </th>
                  ))}
                  <th style={{ textAlign: 'center', padding: `${spacing['3xs']} ${spacing.xs}`, fontSize: typography.sizes.xs, color: statusColors.neutral500, fontWeight: typography.weights.bold, borderBottom: `1px solid ${statusColors.neutral200}` }}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {itemCounts.map(item => (
                  <tr key={item.title}>
                    <td style={{ padding: `${spacing['2xs']} ${spacing.xs}`, fontSize: typography.sizes.sm, fontWeight: typography.weights.medium, color: statusColors.neutral800, borderBottom: `1px solid ${statusColors.neutral100}` }}>
                      {item.title}
                    </td>
                    {waveOrderingEnabled && waves.map(w => (
                      <td key={w.id} style={{ textAlign: 'center', padding: `${spacing['2xs']} ${spacing.xs}`, fontSize: typography.sizes.sm, color: statusColors.neutral700, borderBottom: `1px solid ${statusColors.neutral100}` }}>
                        {item.byWave[w.id] || 0}
                      </td>
                    ))}
                    <td style={{ textAlign: 'center', padding: `${spacing['2xs']} ${spacing.xs}`, fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, color: accent, borderBottom: `1px solid ${statusColors.neutral100}` }}>
                      {item.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Wave Tabs + Order List */}
      <div style={{
        backgroundColor: 'white',
        border: `1px solid ${statusColors.neutral200}`,
        borderRadius: radius.lg,
        overflow: 'hidden',
        marginBottom: spacing.md,
      }}>
        <div style={{
          padding: `${spacing.xs} ${spacing.sm}`,
          backgroundColor: statusColors.neutral50,
          borderBottom: `1px solid ${statusColors.neutral200}`,
        }}>
          <h2 style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: statusColors.neutral800, margin: 0 }}>
            Order List
          </h2>
        </div>

        {/* Wave tabs */}
        {waveOrderingEnabled && waves.length > 0 && (
          <div style={{
            display: 'flex',
            gap: 0,
            borderBottom: `1px solid ${statusColors.neutral200}`,
            overflowX: 'auto',
          }}>
            <button
              onClick={() => setActiveWaveTab('all')}
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                border: 'none',
                borderBottom: `2px solid ${activeWaveTab === 'all' ? accent : 'transparent'}`,
                backgroundColor: 'transparent',
                color: activeWaveTab === 'all' ? accent : statusColors.neutral500,
                fontSize: typography.sizes.xs,
                fontWeight: activeWaveTab === 'all' ? typography.weights.semibold : typography.weights.normal,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              All ({Object.values(ordersByWave).flat().length})
            </button>
            {waves.map(w => {
              const count = (ordersByWave[w.id] || []).length
              return (
                <button
                  key={w.id}
                  onClick={() => setActiveWaveTab(w.id)}
                  style={{
                    padding: `${spacing.xs} ${spacing.sm}`,
                    border: 'none',
                    borderBottom: `2px solid ${activeWaveTab === w.id ? accent : 'transparent'}`,
                    backgroundColor: 'transparent',
                    color: activeWaveTab === w.id ? accent : statusColors.neutral500,
                    fontSize: typography.sizes.xs,
                    fontWeight: activeWaveTab === w.id ? typography.weights.semibold : typography.weights.normal,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  W{w.wave_number} ({count})
                </button>
              )
            })}
          </div>
        )}

        {/* Orders */}
        <div style={{ padding: spacing.xs }}>
          {displayOrders.length === 0 ? (
            <p style={{ color: statusColors.neutral400, fontSize: typography.sizes.sm, margin: 0, textAlign: 'center', padding: spacing.sm }}>
              No orders {activeWaveTab === 'all' ? 'yet' : 'in this wave'}
            </p>
          ) : (
            displayOrders.map((order, i) => (
              <div key={`${order.order_number}-${i}`} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: `${spacing['2xs']} ${spacing.xs}`,
                borderBottom: i < displayOrders.length - 1 ? `1px solid ${statusColors.neutral100}` : 'none',
                backgroundColor: order.fulfilled ? '#f0fdf4' : 'transparent',
              }}>
                <div>
                  <span style={{
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.semibold,
                    color: order.fulfilled ? '#166534' : statusColors.neutral800,
                    fontFamily: 'monospace',
                  }}>
                    {order.order_number}
                  </span>
                  <span style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, marginLeft: spacing.xs }}>
                    {order.quantity > 1 ? `${order.quantity}x ` : ''}{order.item_title}
                  </span>
                </div>
                <span style={{
                  fontSize: typography.sizes.xs,
                  padding: `1px ${spacing['2xs']}`,
                  borderRadius: radius.sm,
                  backgroundColor: order.fulfilled ? '#dcfce7' : '#dbeafe',
                  color: order.fulfilled ? '#166534' : '#1e40af',
                  fontWeight: typography.weights.medium,
                }}>
                  {order.fulfilled ? '✓' : 'pending'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Revenue */}
      <div style={{
        textAlign: 'center',
        padding: spacing.sm,
        backgroundColor: statusColors.neutral50,
        borderRadius: radius.md,
        fontSize: typography.sizes.sm,
        color: statusColors.neutral600,
      }}>
        Estimated revenue: <strong style={{ color: accent }}>{formatPrice(summary.totalRevenueCents)}</strong>
        {summary.maxOrdersTotal && (
          <> &middot; Cap: {summary.totalOrders}/{summary.maxOrdersTotal} orders</>
        )}
      </div>
    </div>
  )
}
