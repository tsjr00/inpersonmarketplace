'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import OrderStatusSummary from '@/components/buyer/OrderStatusSummary'
import OrderTimeline from '@/components/buyer/OrderTimeline'
import PickupDetails from '@/components/buyer/PickupDetails'
import { formatPrice } from '@/lib/constants'

interface Market {
  id: string
  name: string
  type: string
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  contact_email: string | null
  contact_phone: string | null
  schedules: {
    day_of_week: number
    start_time: string
    end_time: string
  }[]
}

interface OrderItem {
  id: string
  listing_id: string
  listing_title: string
  listing_description: string
  listing_image: string | null
  quantity: number
  unit_price_cents: number
  subtotal_cents: number
  status: string
  vendor_name: string
  vendor_email: string | null
  vendor_phone: string | null
  market: Market
  pickup_date: string | null
}

interface OrderDetail {
  id: string
  order_number: string
  status: string
  total_cents: number
  created_at: string
  updated_at: string
  items: OrderItem[]
}

export default function BuyerOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const orderId = params.id as string

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchOrder()
  }, [orderId])

  const fetchOrder = async () => {
    try {
      const res = await fetch(`/api/buyer/orders/${orderId}`)
      if (!res.ok) {
        if (res.status === 401) {
          router.push(`/${vertical}/login?redirect=/${vertical}/buyer/orders/${orderId}`)
          return
        }
        throw new Error('Order not found')
      }
      const data = await res.json()
      setOrder(data.order)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8f9fa'
      }}>
        <p>Loading order details...</p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8f9fa',
        gap: 16
      }}>
        <p style={{ color: '#991b1b' }}>{error || 'Order not found'}</p>
        <Link
          href={`/${vertical}/buyer/orders`}
          style={{
            padding: '10px 20px',
            backgroundColor: '#3b82f6',
            color: 'white',
            textDecoration: 'none',
            borderRadius: 6,
            fontWeight: 600
          }}
        >
          Back to Orders
        </Link>
      </div>
    )
  }

  // Group items by market
  const marketGroups = order.items.reduce((acc, item) => {
    const marketId = item.market.id
    if (!acc[marketId]) {
      acc[marketId] = {
        market: item.market,
        items: [],
        pickupDate: item.pickup_date
      }
    }
    acc[marketId].items.push(item)
    return acc
  }, {} as Record<string, { market: Market; items: OrderItem[]; pickupDate: string | null }>)

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8f9fa',
      padding: '40px 20px'
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Back Link */}
        <Link
          href={`/${vertical}/buyer/orders`}
          style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}
        >
          ← Back to Orders
        </Link>

        {/* Header */}
        <div style={{ marginTop: 16, marginBottom: 24 }}>
          <h1 style={{ color: '#111827', marginBottom: 8, marginTop: 0, fontSize: 28, fontWeight: 'bold' }}>
            Order #{order.order_number || order.id.slice(0, 8)}
          </h1>
          <p style={{ color: '#6b7280', margin: 0 }}>
            Placed on {new Date(order.created_at).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </p>
        </div>

        {/* Status Summary */}
        <OrderStatusSummary status={order.status} updatedAt={order.updated_at} />

        {/* Timeline */}
        <OrderTimeline
          status={order.status}
          createdAt={order.created_at}
          updatedAt={order.updated_at}
        />

        {/* Items by Market */}
        {Object.values(marketGroups).map((group) => (
          <div key={group.market.id} style={{ marginBottom: 24 }}>
            {/* Pickup Details */}
            <PickupDetails
              market={group.market}
              pickupDate={group.pickupDate}
            />

            {/* Items for this Market */}
            <div style={{
              padding: 20,
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: 8
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, marginTop: 0, color: '#374151' }}>
                Items from {group.market.name}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {group.items.map(item => (
                  <div key={item.id} style={{
                    display: 'flex',
                    gap: 16,
                    paddingBottom: 16,
                    borderBottom: '1px solid #f3f4f6'
                  }}>
                    {/* Image */}
                    <div style={{
                      width: 80,
                      height: 80,
                      backgroundColor: '#f3f4f6',
                      borderRadius: 6,
                      flexShrink: 0,
                      overflow: 'hidden'
                    }}>
                      {item.listing_image ? (
                        <img
                          src={item.listing_image}
                          alt={item.listing_title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 32
                        }}>
                          📦
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 600, color: '#111827' }}>
                        {item.listing_title}
                      </h4>
                      <p style={{ margin: '0 0 8px 0', fontSize: 13, color: '#6b7280' }}>
                        by {item.vendor_name}
                      </p>
                      <p style={{ margin: 0, fontSize: 14, color: '#374151' }}>
                        Quantity: {item.quantity} × {formatPrice(item.unit_price_cents)} = <strong>{formatPrice(item.subtotal_cents)}</strong>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {/* Order Total */}
        <div style={{
          padding: 20,
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: '#374151' }}>
            Order Total
          </span>
          <span style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>
            {formatPrice(order.total_cents)}
          </span>
        </div>
      </div>
    </div>
  )
}
