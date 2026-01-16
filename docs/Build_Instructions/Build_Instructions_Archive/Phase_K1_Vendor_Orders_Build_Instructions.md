# Build Instructions - Phase K-1: Vendor Order Management

**Instance:** CC1
**Date:** January 14, 2026
**Branch:** feature/vendor-orders
**Priority:** High
**Estimated Time:** 2-3 hours

---

## File Territory

**YOU MAY ONLY CREATE/MODIFY FILES IN:**
- `src/app/[vertical]/vendor/orders/` (all files)
- `src/app/api/vendor/orders/` (all files)
- `src/components/vendor/OrderCard.tsx` (new)
- `src/components/vendor/OrderStatusBadge.tsx` (new)
- `src/components/vendor/OrderFilters.tsx` (new)

**SHARED RESOURCES (READ-ONLY):**
- `orders` table (read only - no schema changes)
- `order_items` table (read only)
- `transactions` table (read only)
- `listings` table (read only)
- `markets` table (read only)
- `src/lib/constants.ts` (read order status enums if they exist)

**DO NOT TOUCH (CC2 Territory):**
- `src/app/[vertical]/buyer/` (any files)
- `src/app/api/buyer/` (any files)
- `src/components/buyer/` (any files)
- `src/components/cart/` (frozen during parallel build)
- `src/app/[vertical]/checkout/` (frozen during parallel build)

---

## Context

Vendors need to manage orders for items they sell. Orders are grouped by market (traditional market or private pickup location) since pickup happens at specific markets. This phase builds vendor-side order management assuming orders already exist in the database.

### Order Status Flow
1. **pending** - Order placed, awaiting vendor confirmation
2. **confirmed** - Vendor confirmed, preparing items
3. **ready** - Items ready for pickup at market
4. **fulfilled** - Customer picked up items
5. **cancelled** - Order cancelled (by buyer or vendor)
6. **expired** - Pickup window passed, late fee applied (traditional markets only)

### Market Types
- **Traditional markets:** Fixed schedule (e.g. "Saturday 8am-1pm"), strict pickup window
- **Private pickup:** Vendor-specific location and flexible timing

---

## Part 1: Vendor Orders API

### GET /api/vendor/orders

**Purpose:** Fetch all orders for vendor's listings with filtering

**Query Parameters:**
- `status` - Filter by order status (pending, confirmed, ready, fulfilled, cancelled)
- `market_id` - Filter by specific market
- `date_from` - Filter orders from date (ISO format)
- `date_to` - Filter orders to date (ISO format)

**File:** `src/app/api/vendor/orders/route.ts`

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

  // Get vendor profile
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!vendorProfile) {
    return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
  }

  // Get query parameters
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const marketId = searchParams.get('market_id')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')

  // Build query for orders containing vendor's items
  let query = supabase
    .from('order_items')
    .select(`
      id,
      order_id,
      listing_id,
      quantity,
      price_cents,
      market_id,
      pickup_date,
      created_at,
      orders!inner (
        id,
        user_id,
        status,
        total_cents,
        created_at,
        updated_at,
        user_profiles (
          display_name
        )
      ),
      listings!inner (
        id,
        title,
        image_urls,
        vendor_profile_id
      ),
      markets (
        id,
        name,
        market_type,
        address,
        city,
        state
      )
    `)
    .eq('listings.vendor_profile_id', vendorProfile.id)
    .order('created_at', { ascending: false })

  // Apply filters
  if (status) {
    query = query.eq('orders.status', status)
  }
  if (marketId) {
    query = query.eq('market_id', marketId)
  }
  if (dateFrom) {
    query = query.gte('created_at', dateFrom)
  }
  if (dateTo) {
    query = query.lte('created_at', dateTo)
  }

  const { data: orderItems, error } = await query

  if (error) {
    console.error('[/api/vendor/orders] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Group order items by order_id
  const ordersMap = new Map()
  
  orderItems?.forEach((item: any) => {
    const orderId = item.order_id
    const order = item.orders
    
    if (!ordersMap.has(orderId)) {
      ordersMap.set(orderId, {
        id: orderId,
        status: order.status,
        customer_name: order.user_profiles?.display_name || 'Unknown',
        total_cents: order.total_cents,
        created_at: order.created_at,
        updated_at: order.updated_at,
        items: []
      })
    }
    
    ordersMap.get(orderId).items.push({
      id: item.id,
      listing_id: item.listing_id,
      listing_title: item.listings.title,
      listing_image: item.listings.image_urls?.[0] || null,
      quantity: item.quantity,
      price_cents: item.price_cents,
      market_id: item.market_id,
      market_name: item.markets?.name || 'Unknown',
      market_type: item.markets?.market_type || 'traditional',
      market_address: item.markets?.address || null,
      market_city: item.markets?.city || null,
      pickup_date: item.pickup_date
    })
  })

  const orders = Array.from(ordersMap.values())

  return NextResponse.json({ orders })
}
```

---

### POST /api/vendor/orders/[id]/confirm

**Purpose:** Confirm order (pending → confirmed)

**File:** `src/app/api/vendor/orders/[id]/confirm/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderId } = await context.params
  const supabase = await createClient()
  
  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get vendor profile
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!vendorProfile) {
    return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
  }

  // Verify order contains vendor's items
  const { data: orderItems } = await supabase
    .from('order_items')
    .select(`
      id,
      listings!inner (
        vendor_profile_id
      )
    `)
    .eq('order_id', orderId)
    .eq('listings.vendor_profile_id', vendorProfile.id)

  if (!orderItems || orderItems.length === 0) {
    return NextResponse.json({ error: 'Order not found or unauthorized' }, { status: 404 })
  }

  // Update order status
  const { data: order, error } = await supabase
    .from('orders')
    .update({ 
      status: 'confirmed',
      updated_at: new Date().toISOString()
    })
    .eq('id', orderId)
    .eq('status', 'pending') // Only allow pending → confirmed
    .select()
    .single()

  if (error) {
    console.error('[/api/vendor/orders/confirm] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!order) {
    return NextResponse.json({ error: 'Order not in pending status' }, { status: 400 })
  }

  return NextResponse.json({ order })
}
```

---

### POST /api/vendor/orders/[id]/ready

**Purpose:** Mark order as ready for pickup (confirmed → ready)

**File:** `src/app/api/vendor/orders/[id]/ready/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderId } = await context.params
  const supabase = await createClient()
  
  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get vendor profile
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!vendorProfile) {
    return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
  }

  // Verify order contains vendor's items
  const { data: orderItems } = await supabase
    .from('order_items')
    .select(`
      id,
      listings!inner (
        vendor_profile_id
      )
    `)
    .eq('order_id', orderId)
    .eq('listings.vendor_profile_id', vendorProfile.id)

  if (!orderItems || orderItems.length === 0) {
    return NextResponse.json({ error: 'Order not found or unauthorized' }, { status: 404 })
  }

  // Update order status
  const { data: order, error } = await supabase
    .from('orders')
    .update({ 
      status: 'ready',
      updated_at: new Date().toISOString()
    })
    .eq('id', orderId)
    .eq('status', 'confirmed') // Only allow confirmed → ready
    .select()
    .single()

  if (error) {
    console.error('[/api/vendor/orders/ready] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!order) {
    return NextResponse.json({ error: 'Order not in confirmed status' }, { status: 400 })
  }

  return NextResponse.json({ order })
}
```

---

### POST /api/vendor/orders/[id]/fulfill

**Purpose:** Mark order as fulfilled (ready → fulfilled, customer picked up)

**File:** `src/app/api/vendor/orders/[id]/fulfill/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: orderId } = await context.params
  const supabase = await createClient()
  
  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get vendor profile
  const { data: vendorProfile } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!vendorProfile) {
    return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
  }

  // Verify order contains vendor's items
  const { data: orderItems } = await supabase
    .from('order_items')
    .select(`
      id,
      listings!inner (
        vendor_profile_id
      )
    `)
    .eq('order_id', orderId)
    .eq('listings.vendor_profile_id', vendorProfile.id)

  if (!orderItems || orderItems.length === 0) {
    return NextResponse.json({ error: 'Order not found or unauthorized' }, { status: 404 })
  }

  // Update order status
  const { data: order, error } = await supabase
    .from('orders')
    .update({ 
      status: 'fulfilled',
      updated_at: new Date().toISOString()
    })
    .eq('id', orderId)
    .eq('status', 'ready') // Only allow ready → fulfilled
    .select()
    .single()

  if (error) {
    console.error('[/api/vendor/orders/fulfill] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!order) {
    return NextResponse.json({ error: 'Order not in ready status' }, { status: 400 })
  }

  return NextResponse.json({ order })
}
```

---

## Part 2: Vendor Orders Components

### OrderStatusBadge Component

**File:** `src/components/vendor/OrderStatusBadge.tsx`

```typescript
'use client'

interface OrderStatusBadgeProps {
  status: string
}

const STATUS_COLORS = {
  pending: { bg: '#fef3c7', text: '#92400e' },
  confirmed: { bg: '#dbeafe', text: '#1e40af' },
  ready: { bg: '#d1fae5', text: '#065f46' },
  fulfilled: { bg: '#e0e7ff', text: '#4338ca' },
  cancelled: { bg: '#fee2e2', text: '#991b1b' },
  expired: { bg: '#f3f4f6', text: '#4b5563' }
}

const STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  ready: 'Ready for Pickup',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
  expired: 'Expired'
}

export default function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const colors = STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.pending
  const label = STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status

  return (
    <span style={{
      padding: '4px 12px',
      borderRadius: 12,
      fontSize: 13,
      fontWeight: 600,
      backgroundColor: colors.bg,
      color: colors.text,
      display: 'inline-block'
    }}>
      {label}
    </span>
  )
}
```

---

### OrderFilters Component

**File:** `src/components/vendor/OrderFilters.tsx`

```typescript
'use client'

interface OrderFiltersProps {
  currentStatus: string | null
  currentMarketId: string | null
  markets: { id: string; name: string }[]
  onStatusChange: (status: string) => void
  onMarketChange: (marketId: string) => void
  onClearFilters: () => void
}

export default function OrderFilters({
  currentStatus,
  currentMarketId,
  markets,
  onStatusChange,
  onMarketChange,
  onClearFilters
}: OrderFiltersProps) {
  return (
    <div style={{
      display: 'flex',
      gap: 12,
      padding: 16,
      backgroundColor: 'white',
      borderRadius: 8,
      border: '1px solid #e5e7eb',
      flexWrap: 'wrap',
      alignItems: 'center'
    }}>
      {/* Status Filter */}
      <div>
        <label style={{ fontSize: 14, fontWeight: 600, marginRight: 8, color: '#374151' }}>
          Status:
        </label>
        <select
          value={currentStatus || ''}
          onChange={(e) => onStatusChange(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
            backgroundColor: 'white',
            minWidth: 150
          }}
        >
          <option value="">All Orders</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="ready">Ready for Pickup</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Market Filter */}
      <div>
        <label style={{ fontSize: 14, fontWeight: 600, marginRight: 8, color: '#374151' }}>
          Market:
        </label>
        <select
          value={currentMarketId || ''}
          onChange={(e) => onMarketChange(e.target.value)}
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: 6,
            fontSize: 14,
            backgroundColor: 'white',
            minWidth: 180
          }}
        >
          <option value="">All Markets</option>
          {markets.map(market => (
            <option key={market.id} value={market.id}>
              {market.name}
            </option>
          ))}
        </select>
      </div>

      {/* Clear Filters */}
      {(currentStatus || currentMarketId) && (
        <button
          onClick={onClearFilters}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f3f4f6',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            color: '#374151',
            cursor: 'pointer'
          }}
        >
          Clear Filters
        </button>
      )}
    </div>
  )
}
```

---

### OrderCard Component

**File:** `src/components/vendor/OrderCard.tsx`

```typescript
'use client'
import OrderStatusBadge from './OrderStatusBadge'
import { formatPrice } from '@/lib/constants'

interface OrderCardProps {
  order: {
    id: string
    status: string
    customer_name: string
    total_cents: number
    created_at: string
    items: {
      id: string
      listing_title: string
      listing_image: string | null
      quantity: number
      price_cents: number
      market_name: string
      market_type: string
      market_address: string | null
      market_city: string | null
      pickup_date: string | null
    }[]
  }
  onConfirm?: (orderId: string) => void
  onReady?: (orderId: string) => void
  onFulfill?: (orderId: string) => void
}

export default function OrderCard({ order, onConfirm, onReady, onFulfill }: OrderCardProps) {
  const orderDate = new Date(order.created_at).toLocaleDateString()
  const orderTime = new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  // Get unique markets for this order
  const markets = [...new Set(order.items.map(item => item.market_name))]

  return (
    <div style={{
      backgroundColor: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      padding: 20,
      marginBottom: 16
    }}>
      {/* Header */}
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
            <OrderStatusBadge status={order.status} />
          </div>
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
            {orderDate} at {orderTime} • Customer: {order.customer_name}
          </p>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
          {formatPrice(order.total_cents)}
        </div>
      </div>

      {/* Markets */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>
          Pickup Location{markets.length > 1 ? 's' : ''}:
        </p>
        {markets.map((market, idx) => (
          <span key={idx} style={{
            display: 'inline-block',
            padding: '4px 10px',
            backgroundColor: '#f3f4f6',
            borderRadius: 6,
            fontSize: 13,
            marginRight: 8,
            marginBottom: 4
          }}>
            {market}
          </span>
        ))}
      </div>

      {/* Items */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>
          Items ({order.items.length}):
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {order.items.map(item => (
            <div key={item.id} style={{
              display: 'flex',
              gap: 12,
              padding: 10,
              backgroundColor: '#f9fafb',
              borderRadius: 6
            }}>
              {/* Image */}
              <div style={{
                width: 50,
                height: 50,
                backgroundColor: '#e5e7eb',
                borderRadius: 4,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {item.listing_image ? (
                  <img 
                    src={item.listing_image} 
                    alt={item.listing_title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }}
                  />
                ) : (
                  <span style={{ fontSize: 20 }}>📦</span>
                )}
              </div>
              
              {/* Info */}
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111827' }}>
                  {item.listing_title}
                </p>
                <p style={{ margin: '2px 0 0 0', fontSize: 13, color: '#6b7280' }}>
                  Qty: {item.quantity} × {formatPrice(item.price_cents)} = {formatPrice(item.quantity * item.price_cents)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {order.status === 'pending' && onConfirm && (
          <button
            onClick={() => onConfirm(order.id)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 40
            }}
          >
            Confirm Order
          </button>
        )}
        
        {order.status === 'confirmed' && onReady && (
          <button
            onClick={() => onReady(order.id)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 40
            }}
          >
            Mark Ready for Pickup
          </button>
        )}
        
        {order.status === 'ready' && onFulfill && (
          <button
            onClick={() => onFulfill(order.id)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 40
            }}
          >
            Mark Fulfilled
          </button>
        )}
      </div>
    </div>
  )
}
```

---

## Part 3: Vendor Orders Page

**File:** `src/app/[vertical]/vendor/orders/page.tsx`

```typescript
'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import OrderCard from '@/components/vendor/OrderCard'
import OrderFilters from '@/components/vendor/OrderFilters'

interface Order {
  id: string
  status: string
  customer_name: string
  total_cents: number
  created_at: string
  items: {
    id: string
    listing_title: string
    listing_image: string | null
    quantity: number
    price_cents: number
    market_name: string
    market_type: string
    market_address: string | null
    market_city: string | null
    pickup_date: string | null
  }[]
}

interface Market {
  id: string
  name: string
}

export default function VendorOrdersPage() {
  const params = useParams()
  const vertical = params.vertical as string

  const [orders, setOrders] = useState<Order[]>([])
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [marketFilter, setMarketFilter] = useState<string | null>(null)

  useEffect(() => {
    fetchOrders()
    fetchMarkets()
  }, [statusFilter, marketFilter])

  const fetchOrders = async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (marketFilter) params.set('market_id', marketFilter)

      const res = await fetch(`/api/vendor/orders?${params.toString()}`)
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

  const fetchMarkets = async () => {
    try {
      const res = await fetch(`/api/vendor/markets`)
      if (res.ok) {
        const data = await res.json()
        const allMarkets = [
          ...(data.fixedMarkets || []),
          ...(data.privatePickupMarkets || [])
        ]
        setMarkets(allMarkets.map((m: any) => ({ id: m.id, name: m.name })))
      }
    } catch (error) {
      console.error('Error fetching markets:', error)
    }
  }

  const handleConfirm = async (orderId: string) => {
    try {
      const res = await fetch(`/api/vendor/orders/${orderId}/confirm`, {
        method: 'POST'
      })
      if (res.ok) {
        fetchOrders() // Refresh
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to confirm order')
      }
    } catch (error) {
      console.error('Error confirming order:', error)
      alert('An error occurred')
    }
  }

  const handleReady = async (orderId: string) => {
    try {
      const res = await fetch(`/api/vendor/orders/${orderId}/ready`, {
        method: 'POST'
      })
      if (res.ok) {
        fetchOrders() // Refresh
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to mark order ready')
      }
    } catch (error) {
      console.error('Error marking order ready:', error)
      alert('An error occurred')
    }
  }

  const handleFulfill = async (orderId: string) => {
    if (!confirm('Mark this order as fulfilled (customer picked up)?')) return

    try {
      const res = await fetch(`/api/vendor/orders/${orderId}/fulfill`, {
        method: 'POST'
      })
      if (res.ok) {
        fetchOrders() // Refresh
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to fulfill order')
      }
    } catch (error) {
      console.error('Error fulfilling order:', error)
      alert('An error occurred')
    }
  }

  const handleClearFilters = () => {
    setStatusFilter(null)
    setMarketFilter(null)
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Loading orders...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: '#111827', marginBottom: 8, fontSize: 28, fontWeight: 'bold' }}>
          Orders
        </h1>
        <p style={{ color: '#6b7280', margin: 0 }}>
          Manage customer orders and pickup fulfillment
        </p>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: 24 }}>
        <OrderFilters
          currentStatus={statusFilter}
          currentMarketId={marketFilter}
          markets={markets}
          onStatusChange={setStatusFilter}
          onMarketChange={setMarketFilter}
          onClearFilters={handleClearFilters}
        />
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 24
      }}>
        <div style={{ padding: 16, backgroundColor: '#fef3c7', borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#92400e' }}>
            Pending
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: 24, fontWeight: 700, color: '#92400e' }}>
            {orders.filter(o => o.status === 'pending').length}
          </p>
        </div>
        <div style={{ padding: 16, backgroundColor: '#dbeafe', borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1e40af' }}>
            Confirmed
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: 24, fontWeight: 700, color: '#1e40af' }}>
            {orders.filter(o => o.status === 'confirmed').length}
          </p>
        </div>
        <div style={{ padding: 16, backgroundColor: '#d1fae5', borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#065f46' }}>
            Ready
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: 24, fontWeight: 700, color: '#065f46' }}>
            {orders.filter(o => o.status === 'ready').length}
          </p>
        </div>
        <div style={{ padding: 16, backgroundColor: '#e0e7ff', borderRadius: 8 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#4338ca' }}>
            Fulfilled
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: 24, fontWeight: 700, color: '#4338ca' }}>
            {orders.filter(o => o.status === 'fulfilled').length}
          </p>
        </div>
      </div>

      {/* Orders List */}
      {orders.length > 0 ? (
        <div>
          {orders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onConfirm={handleConfirm}
              onReady={handleReady}
              onFulfill={handleFulfill}
            />
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
            No orders found.
          </p>
          <p style={{ color: '#9ca3af', fontSize: 14, marginTop: 8 }}>
            {statusFilter || marketFilter
              ? 'Try adjusting your filters.'
              : 'Orders will appear here when customers make purchases.'}
          </p>
        </div>
      )}
    </div>
  )
}
```

---

## Part 4: Update Vendor Dashboard

**File:** `src/app/[vertical]/vendor/dashboard/page.tsx`

Add Orders link to action cards section:

```typescript
{/* Orders Card */}
<Link
  href={`/${vertical}/vendor/orders`}
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
    Orders
  </h3>
  <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>
    Manage customer orders
  </p>
</Link>
```

---

## Part 5: Test Data Creation

**For testing only - create a few mock orders in Dev database:**

```sql
-- Create a test buyer user (if doesn't exist)
INSERT INTO user_profiles (user_id, display_name, role)
VALUES 
  ('test-buyer-id-123', 'Test Buyer', 'buyer')
ON CONFLICT (user_id) DO NOTHING;

-- Create test orders
INSERT INTO orders (id, user_id, status, total_cents, created_at)
VALUES
  ('order-test-1', 'test-buyer-id-123', 'pending', 2500, NOW() - INTERVAL '2 hours'),
  ('order-test-2', 'test-buyer-id-123', 'confirmed', 1800, NOW() - INTERVAL '1 day'),
  ('order-test-3', 'test-buyer-id-123', 'ready', 3200, NOW() - INTERVAL '3 days');

-- Create order items (link to your actual listings and markets)
-- Replace [YOUR_LISTING_ID] and [YOUR_MARKET_ID] with real IDs
INSERT INTO order_items (order_id, listing_id, quantity, price_cents, market_id)
VALUES
  ('order-test-1', '[YOUR_LISTING_ID]', 2, 1250, '[YOUR_MARKET_ID]'),
  ('order-test-2', '[YOUR_LISTING_ID]', 1, 1800, '[YOUR_MARKET_ID]'),
  ('order-test-3', '[YOUR_LISTING_ID]', 3, 1067, '[YOUR_MARKET_ID]');
```

**Note:** Replace placeholder IDs with actual listing_id and market_id from your database.

---

## Testing Checklist

### API Endpoints
- [ ] GET `/api/vendor/orders` returns vendor's orders only
- [ ] Filter by status works
- [ ] Filter by market works
- [ ] POST `/api/vendor/orders/[id]/confirm` updates status pending → confirmed
- [ ] POST `/api/vendor/orders/[id]/ready` updates status confirmed → ready
- [ ] POST `/api/vendor/orders/[id]/fulfill` updates status ready → fulfilled
- [ ] Vendor cannot confirm/ready/fulfill other vendors' orders

### UI Components
- [ ] OrderStatusBadge shows correct colors for each status
- [ ] OrderFilters dropdown works
- [ ] OrderCard displays all order information
- [ ] OrderCard action buttons appear for correct statuses
- [ ] Vendor dashboard has Orders link

### Vendor Orders Page
- [ ] Page loads at `/[vertical]/vendor/orders`
- [ ] Orders list displays correctly
- [ ] Stats cards show accurate counts
- [ ] Filtering by status works
- [ ] Filtering by market works
- [ ] Clear filters button works
- [ ] Confirm order button updates status
- [ ] Mark ready button updates status
- [ ] Mark fulfilled button updates status with confirmation

### Mobile Responsive
- [ ] Order cards stack properly on mobile
- [ ] Filters wrap on small screens
- [ ] Action buttons are tappable (44px min)
- [ ] Stats cards display in single column on mobile

---

## Commit Strategy

```bash
# After API endpoints
git add src/app/api/vendor/orders/
git commit -m "feat(orders): Add vendor orders API endpoints"

# After components
git add src/components/vendor/Order*.tsx
git commit -m "feat(orders): Add vendor order UI components"

# After orders page
git add src/app/[vertical]/vendor/orders/
git commit -m "feat(orders): Add vendor orders management page"

# After dashboard update
git add src/app/[vertical]/vendor/dashboard/page.tsx
git commit -m "feat(orders): Add orders link to vendor dashboard"

# Push
git push origin feature/vendor-orders
```

---

## Session Summary Template

```markdown
# Session Summary - Phase K-1: Vendor Order Management

**Date:** [DATE]
**Duration:** [TIME]
**Branch:** feature/vendor-orders

## Completed
- [ ] Vendor orders API endpoints (GET, confirm, ready, fulfill)
- [ ] OrderStatusBadge component
- [ ] OrderFilters component
- [ ] OrderCard component
- [ ] Vendor orders page
- [ ] Dashboard orders link

## Files Created
[List all files]

## Testing Results
[Fill from checklist]

## Notes
[Any issues or observations]
```

---

*End of build instructions for CC1*
