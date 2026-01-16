# Build Instructions - Phase K-2: Buyer Order History & Tracking

**Instance:** CC2
**Date:** January 14, 2026
**Branch:** feature/buyer-orders
**Priority:** High
**Estimated Time:** 2-3 hours

---

## File Territory

**YOU MAY ONLY CREATE/MODIFY FILES IN:**
- `src/app/[vertical]/buyer/orders/` (all files)
- `src/app/api/buyer/orders/` (all files)
- `src/components/buyer/OrderTimeline.tsx` (new)
- `src/components/buyer/OrderStatusSummary.tsx` (new)
- `src/components/buyer/PickupDetails.tsx` (new)

**SHARED RESOURCES (READ-ONLY):**
- `orders` table (read only - no schema changes)
- `order_items` table (read only)
- `transactions` table (read only)
- `listings` table (read only)
- `markets` table (read only)
- `market_schedules` table (read only)
- `src/lib/constants.ts` (read order status enums if they exist)

**DO NOT TOUCH (CC1 Territory):**
- `src/app/[vertical]/vendor/` (any files)
- `src/app/api/vendor/` (any files)
- `src/components/vendor/` (any files)
- `src/components/cart/` (frozen during parallel build)
- `src/app/[vertical]/checkout/` (frozen during parallel build)

---

## Context

Buyers need to track their orders and understand pickup requirements. Orders are tied to specific markets (traditional or private pickup), and buyers must pick up during specified times. This phase builds buyer-side order tracking assuming orders already exist in the database.

### Order Status Flow (Buyer View)
1. **pending** - Order placed, awaiting vendor confirmation
2. **confirmed** - Vendor confirmed, preparing your items
3. **ready** - Ready for pickup at market
4. **fulfilled** - You picked up your order
5. **cancelled** - Order was cancelled
6. **expired** - Pickup window passed (traditional markets only)

### Market Types & Pickup Rules
- **Traditional markets:** Fixed schedule (e.g. "Saturday 8am-1pm")
  - Buyer acknowledges market hours at purchase
  - Late pickup = fee applies (future feature)
- **Private pickup:** Vendor-specific location and timing
  - Buyer sees vendor's available times
  - Buyer acknowledges availability at purchase

---

## Part 1: Buyer Orders API

### GET /api/buyer/orders

**Purpose:** Fetch all orders for authenticated buyer

**Query Parameters:**
- `status` - Filter by order status (pending, confirmed, ready, fulfilled, cancelled)

**File:** `src/app/api/buyer/orders/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  
  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get query parameters
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  // Build query
  let query = supabase
    .from('orders')
    .select(`
      id,
      user_id,
      status,
      total_cents,
      created_at,
      updated_at,
      order_items (
        id,
        listing_id,
        quantity,
        price_cents,
        market_id,
        pickup_date,
        listings (
          id,
          title,
          image_urls,
          vendor_profiles (
            id,
            profile_data
          )
        ),
        markets (
          id,
          name,
          market_type,
          address,
          city,
          state,
          zip
        )
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Apply status filter
  if (status) {
    query = query.eq('status', status)
  }

  const { data: orders, error } = await query

  if (error) {
    console.error('[/api/buyer/orders] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Transform orders for cleaner structure
  const transformedOrders = orders?.map((order: any) => ({
    id: order.id,
    status: order.status,
    total_cents: order.total_cents,
    created_at: order.created_at,
    updated_at: order.updated_at,
    items: order.order_items?.map((item: any) => ({
      id: item.id,
      listing_id: item.listing_id,
      listing_title: item.listings?.title || 'Unknown',
      listing_image: item.listings?.image_urls?.[0] || null,
      quantity: item.quantity,
      price_cents: item.price_cents,
      vendor_name: 
        item.listings?.vendor_profiles?.profile_data?.business_name ||
        item.listings?.vendor_profiles?.profile_data?.farm_name ||
        'Vendor',
      market: {
        id: item.markets?.id,
        name: item.markets?.name || 'Unknown',
        type: item.markets?.market_type || 'traditional',
        address: item.markets?.address,
        city: item.markets?.city,
        state: item.markets?.state,
        zip: item.markets?.zip
      },
      pickup_date: item.pickup_date
    })) || []
  }))

  return NextResponse.json({ orders: transformedOrders })
}
```

---

### GET /api/buyer/orders/[id]

**Purpose:** Get single order with full details including market schedules

**File:** `src/app/api/buyer/orders/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: orderId } = await context.params
  const supabase = await createClient()
  
  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch order
  const { data: order, error } = await supabase
    .from('orders')
    .select(`
      id,
      user_id,
      status,
      total_cents,
      created_at,
      updated_at,
      order_items (
        id,
        listing_id,
        quantity,
        price_cents,
        market_id,
        pickup_date,
        listings (
          id,
          title,
          description,
          image_urls,
          vendor_profiles (
            id,
            profile_data
          )
        ),
        markets (
          id,
          name,
          market_type,
          address,
          city,
          state,
          zip,
          contact_email,
          contact_phone,
          market_schedules (
            day_of_week,
            start_time,
            end_time
          )
        )
      )
    `)
    .eq('id', orderId)
    .eq('user_id', user.id) // Only buyer's orders
    .single()

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Transform order
  const transformedOrder = {
    id: order.id,
    status: order.status,
    total_cents: order.total_cents,
    created_at: order.created_at,
    updated_at: order.updated_at,
    items: order.order_items?.map((item: any) => ({
      id: item.id,
      listing_id: item.listing_id,
      listing_title: item.listings?.title || 'Unknown',
      listing_description: item.listings?.description || '',
      listing_image: item.listings?.image_urls?.[0] || null,
      quantity: item.quantity,
      price_cents: item.price_cents,
      vendor_name: 
        item.listings?.vendor_profiles?.profile_data?.business_name ||
        item.listings?.vendor_profiles?.profile_data?.farm_name ||
        'Vendor',
      vendor_email: item.listings?.vendor_profiles?.profile_data?.email || null,
      vendor_phone: item.listings?.vendor_profiles?.profile_data?.phone || null,
      market: {
        id: item.markets?.id,
        name: item.markets?.name || 'Unknown',
        type: item.markets?.market_type || 'traditional',
        address: item.markets?.address,
        city: item.markets?.city,
        state: item.markets?.state,
        zip: item.markets?.zip,
        contact_email: item.markets?.contact_email,
        contact_phone: item.markets?.contact_phone,
        schedules: item.markets?.market_schedules || []
      },
      pickup_date: item.pickup_date
    })) || []
  }

  return NextResponse.json({ order: transformedOrder })
}
```

---

## Part 2: Buyer Orders Components

### OrderStatusSummary Component

**File:** `src/components/buyer/OrderStatusSummary.tsx`

```typescript
'use client'

interface OrderStatusSummaryProps {
  status: string
  updatedAt: string
}

const STATUS_INFO = {
  pending: {
    icon: '⏳',
    color: '#f59e0b',
    bg: '#fef3c7',
    title: 'Order Pending',
    message: 'Waiting for vendor confirmation'
  },
  confirmed: {
    icon: '✓',
    color: '#3b82f6',
    bg: '#dbeafe',
    title: 'Order Confirmed',
    message: 'Vendor is preparing your items'
  },
  ready: {
    icon: '📦',
    color: '#10b981',
    bg: '#d1fae5',
    title: 'Ready for Pickup',
    message: 'Your order is ready! Pick up at the market'
  },
  fulfilled: {
    icon: '✓',
    color: '#8b5cf6',
    bg: '#e0e7ff',
    title: 'Order Fulfilled',
    message: 'You picked up your order'
  },
  cancelled: {
    icon: '✕',
    color: '#ef4444',
    bg: '#fee2e2',
    title: 'Order Cancelled',
    message: 'This order was cancelled'
  },
  expired: {
    icon: '⏱',
    color: '#6b7280',
    bg: '#f3f4f6',
    title: 'Pickup Expired',
    message: 'Pickup window has passed'
  }
}

export default function OrderStatusSummary({ status, updatedAt }: OrderStatusSummaryProps) {
  const info = STATUS_INFO[status as keyof typeof STATUS_INFO] || STATUS_INFO.pending
  const lastUpdated = new Date(updatedAt).toLocaleString()

  return (
    <div style={{
      padding: 20,
      backgroundColor: info.bg,
      borderRadius: 8,
      border: `2px solid ${info.color}`,
      marginBottom: 24
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 32 }}>{info.icon}</span>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: info.color }}>
            {info.title}
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 14, color: info.color }}>
            {info.message}
          </p>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
        Last updated: {lastUpdated}
      </p>
    </div>
  )
}
```

---

### OrderTimeline Component

**File:** `src/components/buyer/OrderTimeline.tsx`

```typescript
'use client'

interface OrderTimelineProps {
  status: string
  createdAt: string
  updatedAt: string
}

const TIMELINE_STEPS = [
  { key: 'pending', label: 'Order Placed' },
  { key: 'confirmed', label: 'Confirmed by Vendor' },
  { key: 'ready', label: 'Ready for Pickup' },
  { key: 'fulfilled', label: 'Picked Up' }
]

const STATUS_ORDER = ['pending', 'confirmed', 'ready', 'fulfilled', 'cancelled', 'expired']

export default function OrderTimeline({ status, createdAt, updatedAt }: OrderTimelineProps) {
  const currentIndex = STATUS_ORDER.indexOf(status)
  const isCancelled = status === 'cancelled'
  const isExpired = status === 'expired'

  if (isCancelled || isExpired) {
    return (
      <div style={{
        padding: 16,
        backgroundColor: '#fee2e2',
        borderRadius: 8,
        marginBottom: 24
      }}>
        <p style={{ margin: 0, fontSize: 14, color: '#991b1b' }}>
          {isCancelled ? 'Order was cancelled' : 'Pickup window expired'}
        </p>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#374151' }}>
        Order Timeline
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {TIMELINE_STEPS.map((step, index) => {
          const isComplete = STATUS_ORDER.indexOf(step.key) <= currentIndex
          const isCurrent = step.key === status

          return (
            <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Circle indicator */}
              <div style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                backgroundColor: isComplete ? '#10b981' : '#e5e7eb',
                border: isCurrent ? '3px solid #10b981' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {isComplete && (
                  <span style={{ color: 'white', fontSize: 14, fontWeight: 'bold' }}>✓</span>
                )}
              </div>

              {/* Label */}
              <div>
                <p style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: isCurrent ? 600 : 400,
                  color: isComplete ? '#111827' : '#9ca3af'
                }}>
                  {step.label}
                </p>
                {isCurrent && (
                  <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                    {new Date(updatedAt).toLocaleString()}
                  </p>
                )}
                {index === 0 && (
                  <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#6b7280' }}>
                    {new Date(createdAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

---

### PickupDetails Component

**File:** `src/components/buyer/PickupDetails.tsx`

```typescript
'use client'

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

interface PickupDetailsProps {
  market: Market
  pickupDate: string | null
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function PickupDetails({ market, pickupDate }: PickupDetailsProps) {
  const isTraditional = market.type === 'traditional'

  return (
    <div style={{
      padding: 20,
      backgroundColor: '#f9fafb',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      marginBottom: 24
    }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#374151' }}>
        📍 Pickup Location
      </h3>

      {/* Market Name */}
      <p style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 600, color: '#111827' }}>
        {market.name}
      </p>

      {/* Address */}
      {market.address && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
            {market.address}
          </p>
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
            {market.city}, {market.state} {market.zip}
          </p>
        </div>
      )}

      {/* Hours (Traditional Market) */}
      {isTraditional && market.schedules && market.schedules.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 4px 0', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            Market Hours:
          </p>
          {market.schedules.map((schedule, idx) => (
            <p key={idx} style={{ margin: '2px 0', fontSize: 14, color: '#6b7280' }}>
              {DAYS[schedule.day_of_week]}: {schedule.start_time} - {schedule.end_time}
            </p>
          ))}
          <p style={{
            margin: '8px 0 0 0',
            fontSize: 13,
            color: '#ef4444',
            fontWeight: 600
          }}>
            ⚠️ Late pickup may incur a fee
          </p>
        </div>
      )}

      {/* Pickup Date (Private Pickup) */}
      {!isTraditional && pickupDate && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: '0 0 4px 0', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            Pickup Window:
          </p>
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
            {new Date(pickupDate).toLocaleString()}
          </p>
        </div>
      )}

      {/* Contact Info */}
      {(market.contact_email || market.contact_phone) && (
        <div>
          <p style={{ margin: '0 0 4px 0', fontSize: 13, fontWeight: 600, color: '#374151' }}>
            Questions? Contact:
          </p>
          {market.contact_email && (
            <p style={{ margin: '2px 0', fontSize: 14, color: '#6b7280' }}>
              📧 {market.contact_email}
            </p>
          )}
          {market.contact_phone && (
            <p style={{ margin: '2px 0', fontSize: 14, color: '#6b7280' }}>
              📞 {market.contact_phone}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

---

## Part 3: Buyer Orders List Page

**File:** `src/app/[vertical]/buyer/orders/page.tsx`

```typescript
'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { formatPrice } from '@/lib/constants'

interface Order {
  id: string
  status: string
  total_cents: number
  created_at: string
  updated_at: string
  items: {
    id: string
    listing_title: string
    listing_image: string | null
    quantity: number
    price_cents: number
    vendor_name: string
    market: {
      name: string
      type: string
    }
  }[]
}

export default function BuyerOrdersPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')

  useEffect(() => {
    fetchOrders()
  }, [statusFilter])

  const fetchOrders = async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)

      const res = await fetch(`/api/buyer/orders?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setOrders(data.orders || [])
      }
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; text: string }> = {
      pending: { bg: '#fef3c7', text: '#92400e' },
      confirmed: { bg: '#dbeafe', text: '#1e40af' },
      ready: { bg: '#d1fae5', text: '#065f46' },
      fulfilled: { bg: '#e0e7ff', text: '#4338ca' },
      cancelled: { bg: '#fee2e2', text: '#991b1b' },
      expired: { bg: '#f3f4f6', text: '#4b5563' }
    }
    const style = styles[status] || styles.pending

    return (
      <span style={{
        padding: '4px 12px',
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.text
      }}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Loading your orders...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: '#111827', marginBottom: 8, fontSize: 28, fontWeight: 'bold' }}>
          My Orders
        </h1>
        <p style={{ color: '#6b7280', margin: 0 }}>
          Track your orders and pickup details
        </p>
      </div>

      {/* Filter */}
      <div style={{ marginBottom: 24, display: 'flex', gap: 10, alignItems: 'center' }}>
        <label style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>
          Filter:
        </label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
            backgroundColor: 'white'
          }}
        >
          <option value="">All Orders</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="ready">Ready</option>
          <option value="fulfilled">Fulfilled</option>
        </select>
      </div>

      {/* Orders List */}
      {orders.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {orders.map(order => (
            <div
              key={order.id}
              onClick={() => router.push(`/${vertical}/buyer/orders/${order.id}`)}
              style={{
                padding: 20,
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'box-shadow 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {/* Order Header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 16,
                flexWrap: 'wrap',
                gap: 12
              }}>
                <div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 4 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111827' }}>
                      Order #{order.id.slice(0, 8)}
                    </h3>
                    {getStatusBadge(order.status)}
                  </div>
                  <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
                    {new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
                  {formatPrice(order.total_cents)}
                </div>
              </div>

              {/* Order Items Preview */}
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>
                  Items ({order.items.length}):
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {order.items.slice(0, 2).map(item => (
                    <div key={item.id} style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center'
                    }}>
                      <div style={{
                        width: 40,
                        height: 40,
                        backgroundColor: '#f3f4f6',
                        borderRadius: 4,
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
                            fontSize: 16
                          }}>
                            📦
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 14, color: '#111827' }}>
                          {item.listing_title}
                        </p>
                        <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#9ca3af' }}>
                          Qty: {item.quantity} • {item.vendor_name}
                        </p>
                      </div>
                    </div>
                  ))}
                  {order.items.length > 2 && (
                    <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
                      + {order.items.length - 2} more item{order.items.length - 2 > 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>

              {/* Pickup Location */}
              <div style={{
                padding: 12,
                backgroundColor: '#f9fafb',
                borderRadius: 6,
                marginTop: 12
              }}>
                <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
                  📍 Pickup: {order.items[0]?.market.name}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          padding: 60,
          backgroundColor: 'white',
          borderRadius: 8,
          textAlign: 'center',
          border: '1px solid #e5e7eb'
        }}>
          <p style={{ color: '#6b7280', fontSize: 16 }}>
            You haven't placed any orders yet.
          </p>
          <p style={{ color: '#9ca3af', fontSize: 14, marginTop: 8 }}>
            Browse products and place your first order!
          </p>
        </div>
      )}
    </div>
  )
}
```

---

## Part 4: Buyer Order Detail Page

**File:** `src/app/[vertical]/buyer/orders/[id]/page.tsx`

```typescript
'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import OrderStatusSummary from '@/components/buyer/OrderStatusSummary'
import OrderTimeline from '@/components/buyer/OrderTimeline'
import PickupDetails from '@/components/buyer/PickupDetails'
import { formatPrice } from '@/lib/constants'

interface OrderDetail {
  id: string
  status: string
  total_cents: number
  created_at: string
  updated_at: string
  items: {
    id: string
    listing_id: string
    listing_title: string
    listing_description: string
    listing_image: string | null
    quantity: number
    price_cents: number
    vendor_name: string
    vendor_email: string | null
    vendor_phone: string | null
    market: {
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
    pickup_date: string | null
  }[]
}

export default function BuyerOrderDetailPage() {
  const params = useParams()
  const vertical = params.vertical as string
  const orderId = params.id as string

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOrder()
  }, [orderId])

  const fetchOrder = async () => {
    try {
      const res = await fetch(`/api/buyer/orders/${orderId}`)
      if (res.ok) {
        const data = await res.json()
        setOrder(data.order)
      }
    } catch (error) {
      console.error('Error fetching order:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Loading order details...</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Order not found.</p>
      </div>
    )
  }

  // Group items by market
  const marketGroups = order.items.reduce((acc, item) => {
    const marketId = item.market.id
    if (!acc[marketId]) {
      acc[marketId] = {
        market: item.market,
        items: []
      }
    }
    acc[marketId].items.push(item)
    return acc
  }, {} as Record<string, { market: any; items: any[] }>)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: '#111827', marginBottom: 8, fontSize: 28, fontWeight: 'bold' }}>
          Order #{order.id.slice(0, 8)}
        </h1>
        <p style={{ color: '#6b7280', margin: 0 }}>
          Placed on {new Date(order.created_at).toLocaleDateString()}
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
            pickupDate={group.items[0].pickup_date}
          />

          {/* Items for this Market */}
          <div style={{
            padding: 20,
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 8
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#374151' }}>
              Items
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
                      Quantity: {item.quantity} × {formatPrice(item.price_cents)} = <strong>{formatPrice(item.quantity * item.price_cents)}</strong>
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: '2px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: 18, fontWeight: 600, color: '#374151' }}>
                Total
              </span>
              <span style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>
                {formatPrice(order.total_cents)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
```

---

## Part 5: Add Orders Link to User Dashboard

**File:** `src/app/[vertical]/dashboard/page.tsx`

Add Orders link to the dashboard:

```typescript
{/* Orders Link */}
<Link
  href={`/${vertical}/buyer/orders`}
  style={{
    display: 'block',
    padding: 20,
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    textDecoration: 'none',
    color: '#111827',
    minHeight: 44
  }}
>
  <h3 style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 600 }}>
    My Orders
  </h3>
  <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
    Track your orders
  </p>
</Link>
```

---

## Testing Checklist

### API Endpoints
- [ ] GET `/api/buyer/orders` returns buyer's orders only
- [ ] Filter by status works
- [ ] GET `/api/buyer/orders/[id]` returns full order details
- [ ] Market schedules included for traditional markets
- [ ] Buyer cannot access other buyers' orders

### UI Components
- [ ] OrderStatusSummary shows correct status with icon and colors
- [ ] OrderTimeline shows progress accurately
- [ ] PickupDetails shows market info correctly
- [ ] Traditional market shows hours
- [ ] Private pickup shows vendor schedule

### Buyer Orders Page
- [ ] Page loads at `/[vertical]/buyer/orders`
- [ ] Orders list displays correctly
- [ ] Status filter works
- [ ] Clicking order navigates to detail page
- [ ] Empty state shows when no orders

### Buyer Order Detail Page
- [ ] Page loads at `/[vertical]/buyer/orders/[id]`
- [ ] Status summary displayed
- [ ] Timeline shows order progress
- [ ] Pickup details shown with correct market info
- [ ] Items grouped by market
- [ ] Total calculated correctly

### Mobile Responsive
- [ ] Order cards stack properly on mobile
- [ ] Status badges wrap correctly
- [ ] Pickup details readable on mobile
- [ ] All buttons tappable (44px min)

---

## Commit Strategy

```bash
# After API endpoints
git add src/app/api/buyer/orders/
git commit -m "feat(orders): Add buyer orders API endpoints"

# After components
git add src/components/buyer/
git commit -m "feat(orders): Add buyer order UI components"

# After orders pages
git add src/app/[vertical]/buyer/orders/
git commit -m "feat(orders): Add buyer orders pages"

# After dashboard update
git add src/app/[vertical]/dashboard/page.tsx
git commit -m "feat(orders): Add orders link to user dashboard"

# Push
git push origin feature/buyer-orders
```

---

## Session Summary Template

```markdown
# Session Summary - Phase K-2: Buyer Order History & Tracking

**Date:** [DATE]
**Duration:** [TIME]
**Branch:** feature/buyer-orders

## Completed
- [ ] Buyer orders API endpoints (GET list, GET detail)
- [ ] OrderStatusSummary component
- [ ] OrderTimeline component
- [ ] PickupDetails component
- [ ] Buyer orders list page
- [ ] Buyer order detail page
- [ ] Dashboard orders link

## Files Created
[List all files]

## Testing Results
[Fill from checklist]

## Notes
[Any issues or observations]
```

---

*End of build instructions for CC2*
