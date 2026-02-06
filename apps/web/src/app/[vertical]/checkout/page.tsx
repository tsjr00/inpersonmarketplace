'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCart } from '@/lib/hooks/useCart'
import { ErrorDisplay } from '@/components/ErrorFeedback'
import { calculateBuyerPrice, calculateDisplayPrice, formatPrice, MINIMUM_ORDER_CENTS } from '@/lib/constants'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { formatPickupDate, getPickupDateColor } from '@/types/pickup'

interface CheckoutItem {
  listingId: string
  quantity: number
  title: string
  price_cents: number
  vendor_name: string
  vendor_profile_id?: string
  available: boolean
  available_quantity: number | null
  market_id?: string
  market_name?: string
  market_type?: string
  market_city?: string
  market_state?: string
  // Pickup scheduling fields
  schedule_id?: string
  pickup_date?: string  // YYYY-MM-DD format
  pickup_display?: {
    date_formatted: string
    time_formatted: string | null
    day_name: string | null
  } | null
}

interface SuggestedProduct {
  id: string
  title: string
  price_cents: number
  vendor_profile_id: string
  vendor_profiles?: {
    id: string
    business_name?: string
    tier?: string
  }
}

interface PaymentMethod {
  id: 'stripe' | 'venmo' | 'cashapp' | 'paypal' | 'cash'
  name: string
  icon: string
  description: string
}

interface VendorPaymentInfo {
  vendor_profile_id: string
  vendor_name: string
  venmo_username: string | null
  cashapp_cashtag: string | null
  paypal_username: string | null
  accepts_cash_at_pickup: boolean
}

export default function CheckoutPage() {
  const params = useParams()
  const router = useRouter()
  const vertical = params.vertical as string
  const { items, clearCart, removeFromCart, updateQuantity, hasMultiplePickupLocations, hasScheduleIssues } = useCart()

  const [checkoutItems, setCheckoutItems] = useState<CheckoutItem[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<{ message: string; code?: string; traceId?: string } | null>(null)
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [marketWarnings, setMarketWarnings] = useState<string[]>([])
  const [marketValid, setMarketValid] = useState(true)
  const [suggestedProducts, setSuggestedProducts] = useState<SuggestedProduct[]>([])
  const [multiLocationAcknowledged, setMultiLocationAcknowledged] = useState(false)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null)
  const [vendorPaymentInfo, setVendorPaymentInfo] = useState<VendorPaymentInfo[]>([])

  // Ref to prevent double-click submissions (state update may not re-render in time)
  const isSubmittingRef = useRef(false)

  // Check auth and validate cart items
  useEffect(() => {
    async function validateCart() {
      try {
        // Check authentication
        const authResponse = await fetch('/api/auth/me')
        if (authResponse.ok) {
          const authData = await authResponse.json()
          setUser(authData.user)
        }

        // Validate cart items
        if (items.length === 0) {
          setCheckoutItems([])
          setLoading(false)
          return
        }

        const response = await fetch('/api/cart/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: items.map(item => ({
              listingId: item.listingId,
              quantity: item.quantity,
            })),
          }),
        })

        if (response.ok) {
          const data = await response.json()
          // Merge with cart item market and pickup info
          const mergedItems = (data.items || []).map((validatedItem: CheckoutItem) => {
            // Find by listing + schedule + date (same item can have different pickup dates)
            const cartItem = items.find(i =>
              i.listingId === validatedItem.listingId &&
              i.schedule_id === validatedItem.schedule_id &&
              i.pickup_date === validatedItem.pickup_date
            ) || items.find(i => i.listingId === validatedItem.listingId)
            return {
              ...validatedItem,
              market_id: cartItem?.market_id,
              market_name: cartItem?.market_name,
              market_type: cartItem?.market_type,
              market_city: cartItem?.market_city,
              market_state: cartItem?.market_state,
              schedule_id: cartItem?.schedule_id,
              pickup_date: cartItem?.pickup_date,
              pickup_display: cartItem?.pickup_display,
            }
          })
          setCheckoutItems(mergedItems)
        } else {
          // Fall back to local cart data
          setCheckoutItems(items.map(item => ({
            listingId: item.listingId,
            quantity: item.quantity,
            title: item.title || 'Unknown Item',
            price_cents: item.price_cents || 0,
            vendor_name: item.vendor_name || 'Unknown Vendor',
            available: true,
            available_quantity: null,
            market_id: item.market_id,
            market_name: item.market_name,
            market_type: item.market_type,
            market_city: item.market_city,
            market_state: item.market_state,
            schedule_id: item.schedule_id,
            pickup_date: item.pickup_date,
            pickup_display: item.pickup_display,
          })))
        }
      } catch (err) {
        console.error('Cart validation error:', err)
        setCheckoutItems(items.map(item => ({
          listingId: item.listingId,
          quantity: item.quantity,
          title: item.title || 'Unknown Item',
          price_cents: item.price_cents || 0,
          vendor_name: item.vendor_name || 'Unknown Vendor',
          available: true,
          available_quantity: null,
          market_id: item.market_id,
          market_name: item.market_name,
          market_type: item.market_type,
          market_city: item.market_city,
          market_state: item.market_state,
          schedule_id: item.schedule_id,
          pickup_date: item.pickup_date,
          pickup_display: item.pickup_display,
        })))
      } finally {
        setLoading(false)
      }
    }

    validateCart()
  }, [items])

  // Validate market compatibility
  useEffect(() => {
    async function validateMarkets() {
      if (!user) return

      try {
        const res = await fetch('/api/cart/validate')
        if (res.ok) {
          const data = await res.json()
          setMarketWarnings(data.warnings || [])
          setMarketValid(data.valid !== false && (!data.warnings || data.warnings.length === 0))
        }
      } catch (err) {
        console.error('Market validation error:', err)
      }
    }

    if (user && items.length > 0) {
      validateMarkets()
    }
  }, [user, items])

  // Fetch product suggestions from vendors in cart
  useEffect(() => {
    async function fetchSuggestions() {
      if (checkoutItems.length === 0) {
        setSuggestedProducts([])
        return
      }

      // Get unique vendor IDs from cart
      const vendorIds = [...new Set(checkoutItems.map(item => item.vendor_profile_id).filter(Boolean))]
      const excludeIds = checkoutItems.map(item => item.listingId)

      if (vendorIds.length === 0) return

      try {
        const res = await fetch('/api/listings/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendorIds,
            excludeIds,
            limit: 4,
            vertical
          })
        })

        if (res.ok) {
          const data = await res.json()
          setSuggestedProducts(data.listings || [])
        }
      } catch (err) {
        console.error('Failed to fetch suggestions:', err)
      }
    }

    fetchSuggestions()
  }, [checkoutItems, vertical])

  // Fetch available payment methods from vendors
  useEffect(() => {
    async function fetchPaymentMethods() {
      if (checkoutItems.length === 0) {
        setPaymentMethods([])
        setVendorPaymentInfo([])
        return
      }

      const vendorIds = [...new Set(checkoutItems.map(item => item.vendor_profile_id).filter(Boolean))]
      if (vendorIds.length === 0) return

      try {
        const res = await fetch('/api/checkout/payment-methods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendorProfileIds: vendorIds })
        })

        if (res.ok) {
          const data = await res.json()
          setPaymentMethods(data.methods || [])
          setVendorPaymentInfo(data.vendors || [])

          // Auto-select Stripe if available, otherwise first method
          if (data.methods?.length > 0) {
            const hasStripe = data.methods.some((m: PaymentMethod) => m.id === 'stripe')
            setSelectedPaymentMethod(hasStripe ? 'stripe' : data.methods[0].id)
          }
        }
      } catch (err) {
        console.error('Failed to fetch payment methods:', err)
        // Default to stripe if fetch fails
        setPaymentMethods([{
          id: 'stripe',
          name: 'Credit/Debit Card',
          icon: '💳',
          description: 'Pay securely with card'
        }])
        setSelectedPaymentMethod('stripe')
      }
    }

    fetchPaymentMethods()
  }, [checkoutItems])

  async function handleCheckout() {
    // Prevent double-click submissions using ref (faster than state)
    if (isSubmittingRef.current) {
      return
    }

    if (!user) {
      // Redirect to login with return URL
      router.push(`/${vertical}/login?redirect=/${vertical}/checkout`)
      return
    }

    if (!selectedPaymentMethod) {
      setError({ message: 'Please select a payment method' })
      return
    }

    // Mark as submitting immediately (ref updates synchronously)
    isSubmittingRef.current = true
    setProcessing(true)
    setError(null)

    try {
      // For external payment methods, create order and redirect to external checkout
      if (selectedPaymentMethod !== 'stripe') {
        const response = await fetch('/api/checkout/external', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_method: selectedPaymentMethod,
            vertical
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          setError({
            message: data.error || 'Checkout failed',
            code: data.code,
            traceId: data.traceId
          })
          isSubmittingRef.current = false
          setProcessing(false)
          return
        }

        // Clear cart and redirect to external checkout page
        clearCart()

        // Build URL with order details
        const params = new URLSearchParams({
          order_id: data.order_id,
          order_number: data.order_number,
          payment_method: selectedPaymentMethod,
          subtotal: data.subtotal_cents.toString(),
          buyer_fee: data.buyer_fee_cents.toString(),
          total: data.total_cents.toString(),
          vendor_name: encodeURIComponent(data.vendor_name || 'Vendor')
        })
        if (data.payment_link) {
          params.set('payment_link', encodeURIComponent(data.payment_link))
        }

        router.push(`/${vertical}/checkout/external?${params.toString()}`)
        return
      }

      // Stripe checkout flow
      const response = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: checkoutItems.map(item => ({
            listingId: item.listingId,
            quantity: item.quantity,
            scheduleId: item.schedule_id,
            pickupDate: item.pickup_date,
          })),
          vertical,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError({
          message: data.error || 'Checkout failed',
          code: data.code,
          traceId: data.traceId
        })
        isSubmittingRef.current = false
        setProcessing(false)
        return
      }

      if (data.url) {
        // Redirect to Stripe Checkout — cart is cleared server-side on success
        window.location.href = data.url
      } else if (data.orderId) {
        // Direct success (free order or test mode)
        clearCart()
        router.push(`/${vertical}/checkout/success?order=${data.orderId}`)
      }
    } catch (err: unknown) {
      setError({ message: err instanceof Error ? err.message : 'Checkout failed' })
      isSubmittingRef.current = false
      setProcessing(false)
    }
  }

  // Calculate base subtotal (before fees) for minimum order check
  const baseSubtotal = checkoutItems.reduce((sum, item) => {
    return sum + item.price_cents * item.quantity
  }, 0)

  // Calculate display total with platform fee
  // Use calculateBuyerPrice for order total (includes flat fee once)
  const total = calculateBuyerPrice(baseSubtotal)
  const belowMinimum = baseSubtotal < MINIMUM_ORDER_CENTS
  const amountNeeded = belowMinimum ? ((MINIMUM_ORDER_CENTS - baseSubtotal) / 100).toFixed(2) : '0'

  // Check if all items are available
  const hasUnavailableItems = checkoutItems.some(item => !item.available)

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surfaceBase,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40,
            height: 40,
            border: `4px solid ${colors.border}`,
            borderTop: `4px solid ${colors.primary}`,
            borderRadius: radius.full,
            animation: 'spin 1s linear infinite',
            margin: `0 auto ${spacing.sm}`,
          }} />
          <p style={{ color: colors.textSecondary }}>Loading checkout...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: colors.surfaceBase,
        padding: `${spacing.md} ${spacing.sm}`,
      }}>
        <div style={{
          maxWidth: containers.sm,
          margin: '0 auto',
          textAlign: 'center',
          padding: `${spacing['3xl']} ${spacing.md}`,
        }}>
          <div style={{ fontSize: 80, marginBottom: spacing.md, opacity: 0.3 }}>🛒</div>
          <h1 style={{
            marginBottom: spacing.sm,
            marginTop: 0,
            color: colors.textPrimary,
            fontSize: typography.sizes['2xl'],
          }}>Your cart is empty</h1>
          <p style={{ color: colors.textMuted, marginBottom: spacing.lg }}>
            Add some items to your cart to checkout
          </p>
          <Link
            href={`/${vertical}/browse`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: `${spacing.sm} ${spacing.lg}`,
              backgroundColor: colors.primary,
              color: colors.textInverse,
              textDecoration: 'none',
              borderRadius: radius.sm,
              fontWeight: typography.weights.semibold,
              minHeight: 44,
              boxShadow: shadows.primary,
            }}
          >
            Browse Products
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
      }}
      className="checkout-page"
    >
      {/* Header */}
      <div style={{
        backgroundColor: colors.surfaceElevated,
        borderBottom: `1px solid ${colors.border}`,
        padding: spacing.sm,
      }}>
        <div style={{
          maxWidth: containers.lg,
          margin: '0 auto',
        }}>
          <Link
            href={`/${vertical}/browse`}
            style={{
              color: colors.textMuted,
              textDecoration: 'none',
              fontSize: typography.sizes.sm,
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 44,
            }}
          >
            ← Back to Shopping
          </Link>
          <h1 style={{
            margin: `${spacing['2xs']} 0 0 0`,
            fontSize: typography.sizes.xl,
            color: colors.textPrimary,
          }}>Checkout</h1>
        </div>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: containers.lg,
        margin: '0 auto',
        padding: `${spacing.md} ${spacing.sm}`,
      }}>
        <div className="checkout-grid" style={{
          display: 'grid',
          gap: spacing.md,
        }}>
          {/* Cart Items */}
          <div className="cart-items">
            <h2 style={{
              marginTop: 0,
              marginBottom: spacing.sm,
              fontSize: typography.sizes.lg,
              color: colors.textPrimary,
            }}>Order Items</h2>

            {error && (
              <div style={{ marginBottom: spacing.sm }}>
                <ErrorDisplay error={error} verticalId={vertical} />
              </div>
            )}

            {marketWarnings.length > 0 && (
              <div style={{
                padding: spacing.sm,
                backgroundColor: colors.surfaceSubtle,
                border: `2px solid ${colors.accent}`,
                borderRadius: radius.md,
                marginBottom: spacing.sm,
              }}>
                <p style={{ margin: `0 0 ${spacing['2xs']} 0`, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                  Market Compatibility Issues:
                </p>
                <ul style={{ margin: 0, paddingLeft: spacing.md, color: colors.textSecondary }}>
                  {marketWarnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
              {checkoutItems.map(item => (
                <div
                  key={item.listingId}
                  style={{
                    padding: spacing.sm,
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: radius.md,
                    border: item.available ? `1px solid ${colors.border}` : '2px solid #dc3545',
                    boxShadow: shadows.sm,
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: spacing.xs,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{
                        margin: `0 0 ${spacing['3xs']} 0`,
                        fontSize: typography.sizes.base,
                        color: colors.textPrimary,
                      }}>
                        {item.title}
                      </h3>
                      <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm, margin: `0 0 ${spacing['2xs']} 0` }}>
                        {item.vendor_name}
                      </p>

                      {/* Pickup Location and Date */}
                      {item.market_name && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: spacing['2xs'],
                          padding: `${spacing['2xs']} ${spacing.xs}`,
                          backgroundColor: colors.primaryLight,
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          marginBottom: spacing['2xs'],
                          color: colors.textSecondary,
                        }}>
                          <span>{item.market_type === 'traditional' ? '🏪' : '📦'}</span>
                          <span>
                            <strong>Pickup:</strong> {item.market_name}
                            {item.market_city && ` - ${item.market_city}, ${item.market_state}`}
                            {item.pickup_date && (
                              <>
                                {' · '}
                                <span style={{
                                  fontWeight: 600,
                                  borderBottom: `2px solid ${getPickupDateColor(0)}`,
                                  paddingBottom: 1
                                }}>
                                  {formatPickupDate(item.pickup_date)}
                                </span>
                                {item.pickup_display?.time_formatted && (
                                  <span style={{ fontWeight: 500 }}>
                                    {' @ '}{item.pickup_display.time_formatted}
                                  </span>
                                )}
                              </>
                            )}
                          </span>
                        </div>
                      )}

                      {!item.available && (
                        <div style={{
                          padding: `${spacing['2xs']} ${spacing.xs}`,
                          backgroundColor: '#f8d7da',
                          color: '#721c24',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          marginBottom: spacing['2xs'],
                        }}>
                          {item.available_quantity === 0
                            ? 'Sold out'
                            : `Only ${item.available_quantity} available`
                          }
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
                        <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>Qty:</span>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <button
                            onClick={() => {
                              const cartItem = items.find(ci => ci.listingId === item.listingId)
                              if (cartItem) updateQuantity(cartItem.id, item.quantity - 1)
                            }}
                            style={{
                              width: 36,
                              height: 36,
                              border: `1px solid ${colors.border}`,
                              borderRadius: `${radius.sm} 0 0 ${radius.sm}`,
                              backgroundColor: colors.surfaceElevated,
                              cursor: 'pointer',
                              fontSize: typography.sizes.lg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: colors.textPrimary,
                            }}
                          >
                            −
                          </button>
                          <span style={{
                            width: 40,
                            height: 36,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderTop: `1px solid ${colors.border}`,
                            borderBottom: `1px solid ${colors.border}`,
                            fontSize: typography.sizes.sm,
                            color: colors.textPrimary,
                          }}>
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => {
                              const cartItem = items.find(ci => ci.listingId === item.listingId)
                              if (cartItem) updateQuantity(cartItem.id, item.quantity + 1)
                            }}
                            disabled={item.available_quantity !== null && item.quantity >= item.available_quantity}
                            style={{
                              width: 36,
                              height: 36,
                              border: `1px solid ${colors.border}`,
                              borderRadius: `0 ${radius.sm} ${radius.sm} 0`,
                              backgroundColor: colors.surfaceElevated,
                              cursor: item.available_quantity !== null && item.quantity >= item.available_quantity ? 'not-allowed' : 'pointer',
                              fontSize: typography.sizes.lg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: item.available_quantity !== null && item.quantity >= item.available_quantity ? 0.5 : 1,
                              color: colors.textPrimary,
                            }}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, margin: `0 0 ${spacing['3xs']} 0`, color: colors.textPrimary }}>
                        {formatPrice(calculateDisplayPrice(item.price_cents) * item.quantity)}
                      </p>
                      <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, margin: `0 0 ${spacing['2xs']} 0` }}>
                        {formatPrice(calculateDisplayPrice(item.price_cents))} each
                      </p>
                      <button
                        onClick={() => {
                          const cartItem = items.find(ci => ci.listingId === item.listingId)
                          if (cartItem) removeFromCart(cartItem.id)
                        }}
                        style={{
                          padding: `${spacing['3xs']} ${spacing.xs}`,
                          backgroundColor: colors.surfaceElevated,
                          color: '#dc3545',
                          border: '1px solid #dc3545',
                          borderRadius: radius.sm,
                          cursor: 'pointer',
                          fontSize: typography.sizes.xs,
                          minHeight: 36,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Cross-Sell Section */}
            {suggestedProducts.length > 0 && (
              <div style={{
                marginTop: spacing.md,
                backgroundColor: '#F5F3FF',
                borderRadius: radius.md,
                padding: spacing.md,
                border: '2px solid #DDD6FE'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm }}>
                  <span style={{ fontSize: typography.sizes.xl }}>✨</span>
                  <h3 style={{
                    margin: 0,
                    fontSize: typography.sizes.lg,
                    fontWeight: typography.weights.semibold,
                    color: colors.textPrimary
                  }}>
                    Other items you may enjoy from these vendors
                  </h3>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: spacing.xs
                }}>
                  {suggestedProducts.map(product => (
                    <div
                      key={product.id}
                      style={{
                        backgroundColor: colors.surfaceElevated,
                        borderRadius: radius.md,
                        padding: spacing.xs,
                        border: '1px solid #E9D5FF',
                        boxShadow: shadows.sm,
                      }}
                    >
                      {/* Product image placeholder */}
                      <div style={{
                        width: '100%',
                        height: 80,
                        backgroundColor: colors.surfaceMuted,
                        borderRadius: radius.sm,
                        marginBottom: spacing['2xs'],
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: typography.sizes['2xl']
                      }}>
                        📦
                      </div>

                      <h4 style={{
                        margin: `0 0 ${spacing['3xs']} 0`,
                        fontSize: typography.sizes.sm,
                        fontWeight: typography.weights.semibold,
                        color: colors.textPrimary,
                        lineHeight: typography.leading.snug,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {product.title}
                      </h4>

                      <p style={{
                        margin: `0 0 ${spacing['2xs']} 0`,
                        fontSize: typography.sizes.base,
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: spacing['2xs'],
                        flexWrap: 'wrap'
                      }}>
                        <span style={{ fontWeight: typography.weights.bold, color: colors.primary }}>
                          {formatPrice(calculateDisplayPrice(product.price_cents))}
                        </span>
                        <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted, fontStyle: 'italic' }}>
                          from {product.vendor_profiles?.business_name || 'Vendor'}
                        </span>
                      </p>

                      <Link
                        href={`/${vertical}/listing/${product.id}`}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: `${spacing['2xs']} ${spacing.xs}`,
                          backgroundColor: '#A78BFA',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          fontWeight: typography.weights.semibold,
                          textAlign: 'center',
                          textDecoration: 'none'
                        }}
                      >
                        View Item
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Order Summary */}
          <div className="order-summary">
            <div style={{
              backgroundColor: colors.surfaceElevated,
              borderRadius: radius.md,
              border: `1px solid ${colors.border}`,
              padding: spacing.md,
              position: 'sticky',
              top: spacing.md,
              boxShadow: shadows.md,
            }}>
              <h2 style={{ marginTop: 0, marginBottom: spacing.sm, fontSize: typography.sizes.lg, color: colors.textPrimary }}>Order Summary</h2>

              <div style={{ marginBottom: spacing.sm }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: spacing['2xs'],
                  fontSize: typography.sizes.sm,
                  color: colors.textMuted,
                }}>
                  <span>Items ({checkoutItems.reduce((s, i) => s + i.quantity, 0)})</span>
                  <span>{formatPrice(total)}</span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: spacing.sm,
                  borderTop: `1px solid ${colors.borderMuted}`,
                  fontSize: typography.sizes.lg,
                  fontWeight: typography.weights.bold,
                  color: colors.textPrimary,
                }}>
                  <span>Total</span>
                  <span>{formatPrice(total)}</span>
                </div>
              </div>

              {/* Payment Method Selection */}
              {paymentMethods.length > 1 && (
                <div style={{
                  marginBottom: spacing.sm,
                  padding: spacing.sm,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.md,
                  border: `1px solid ${colors.border}`
                }}>
                  <h3 style={{
                    margin: `0 0 ${spacing.xs} 0`,
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.semibold,
                    color: colors.textPrimary
                  }}>
                    Payment Method
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                    {paymentMethods.map(method => (
                      <label
                        key={method.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: spacing.xs,
                          padding: spacing.xs,
                          backgroundColor: selectedPaymentMethod === method.id ? colors.primaryLight : colors.surfaceElevated,
                          border: selectedPaymentMethod === method.id ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
                          borderRadius: radius.sm,
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={method.id}
                          checked={selectedPaymentMethod === method.id}
                          onChange={() => setSelectedPaymentMethod(method.id)}
                          style={{ width: 18, height: 18 }}
                        />
                        <span style={{ fontSize: typography.sizes.lg }}>{method.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: typography.weights.medium, fontSize: typography.sizes.sm }}>
                            {method.name}
                          </div>
                          <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                            {method.description}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  {selectedPaymentMethod && selectedPaymentMethod !== 'stripe' && (
                    <p style={{
                      margin: `${spacing.xs} 0 0 0`,
                      fontSize: typography.sizes.xs,
                      color: colors.textMuted,
                      fontStyle: 'italic'
                    }}>
                      {selectedPaymentMethod === 'cash'
                        ? 'You will pay in cash when you pick up your order.'
                        : `You will be redirected to complete payment via ${paymentMethods.find(m => m.id === selectedPaymentMethod)?.name}.`
                      }
                    </p>
                  )}
                </div>
              )}

              {/* Single payment method indicator */}
              {paymentMethods.length === 1 && (
                <div style={{
                  marginBottom: spacing.sm,
                  padding: spacing.xs,
                  backgroundColor: colors.surfaceMuted,
                  borderRadius: radius.md,
                  fontSize: typography.sizes.sm,
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xs
                }}>
                  <span>{paymentMethods[0].icon}</span>
                  <span>Pay with {paymentMethods[0].name}</span>
                </div>
              )}

              {!user && (
                <div style={{
                  padding: spacing.xs,
                  backgroundColor: colors.surfaceSubtle,
                  border: `1px solid ${colors.accent}`,
                  borderRadius: radius.md,
                  marginBottom: spacing.sm,
                  fontSize: typography.sizes.sm,
                }}>
                  <strong style={{ color: colors.textPrimary }}>Sign in required</strong>
                  <p style={{ margin: `${spacing['3xs']} 0 0`, color: colors.textSecondary }}>
                    You&apos;ll need to sign in to complete your purchase
                  </p>
                </div>
              )}

              {hasUnavailableItems && (
                <div style={{
                  padding: spacing.xs,
                  backgroundColor: '#f8d7da',
                  border: '1px solid #f5c6cb',
                  borderRadius: radius.md,
                  marginBottom: spacing.sm,
                  fontSize: typography.sizes.sm,
                  color: '#721c24',
                }}>
                  Some items in your cart are no longer available. Please remove them to continue.
                </div>
              )}

              {belowMinimum && (
                <div style={{
                  padding: spacing.sm,
                  backgroundColor: '#fff3cd',
                  border: '1px solid #ffc107',
                  borderRadius: radius.md,
                  marginBottom: spacing.sm,
                  fontSize: typography.sizes.sm,
                  color: '#856404',
                }}>
                  Minimum order is $10.00. Add ${amountNeeded} more to your cart.
                </div>
              )}

              {/* Multi-Location Acknowledgment Notice */}
              {hasMultiplePickupLocations && !multiLocationAcknowledged && (
                <div style={{
                  padding: spacing.sm,
                  backgroundColor: '#fff3cd',
                  border: '2px solid #ffc107',
                  borderRadius: radius.md,
                  marginBottom: spacing.sm,
                }}>
                  <p style={{
                    margin: `0 0 ${spacing.xs} 0`,
                    fontWeight: typography.weights.bold,
                    color: '#856404',
                    fontSize: typography.sizes.sm,
                  }}>
                    📍 Multiple Pickup Locations
                  </p>
                  <p style={{
                    margin: `0 0 ${spacing.xs} 0`,
                    color: '#856404',
                    fontSize: typography.sizes.sm,
                  }}>
                    Your order has items from different locations. You&apos;ll visit each to collect:
                  </p>
                  <ul style={{ margin: `0 0 ${spacing.xs} 0`, paddingLeft: spacing.md }}>
                    {[...new Map(checkoutItems.filter(i => i.market_name).map(i => [i.market_id, i])).values()].map(item => (
                      <li key={item.market_id} style={{ fontSize: typography.sizes.xs, color: '#856404', marginBottom: 2 }}>
                        {item.market_type === 'traditional' ? '🏪' : '📦'} <strong>{item.market_name}</strong>
                        {item.market_city && ` (${item.market_city}, ${item.market_state})`}
                      </li>
                    ))}
                  </ul>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.xs,
                    cursor: 'pointer',
                    fontSize: typography.sizes.sm,
                    color: '#856404',
                    fontWeight: typography.weights.semibold,
                    paddingTop: spacing['2xs'],
                    borderTop: '1px solid rgba(133, 100, 4, 0.2)',
                  }}>
                    <input
                      type="checkbox"
                      checked={multiLocationAcknowledged}
                      onChange={(e) => setMultiLocationAcknowledged(e.target.checked)}
                      style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
                    />
                    I understand I&apos;ll visit multiple locations
                  </label>
                </div>
              )}

              <button
                onClick={handleCheckout}
                disabled={processing || hasUnavailableItems || belowMinimum || !marketValid || hasScheduleIssues || (hasMultiplePickupLocations && !multiLocationAcknowledged) || !!(user && !selectedPaymentMethod)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: `${spacing.sm} ${spacing.md}`,
                  fontSize: typography.sizes.base,
                  fontWeight: typography.weights.semibold,
                  backgroundColor: processing || hasUnavailableItems || belowMinimum || !marketValid || (hasMultiplePickupLocations && !multiLocationAcknowledged) || !!(user && !selectedPaymentMethod) ? colors.border : colors.primary,
                  color: colors.textInverse,
                  border: 'none',
                  borderRadius: radius.sm,
                  cursor: processing || hasUnavailableItems || belowMinimum || !marketValid || hasScheduleIssues || (hasMultiplePickupLocations && !multiLocationAcknowledged) || !!(user && !selectedPaymentMethod) ? 'not-allowed' : 'pointer',
                  minHeight: 48,
                  boxShadow: processing || hasUnavailableItems || belowMinimum || !marketValid || hasScheduleIssues || (hasMultiplePickupLocations && !multiLocationAcknowledged) || !!(user && !selectedPaymentMethod) ? 'none' : shadows.primary,
                }}
              >
                {processing ? 'Processing...' : belowMinimum ? `Add $${amountNeeded} More` : !marketValid ? 'Fix Market Issues' : hasScheduleIssues ? 'Remove Unavailable Items' : (hasMultiplePickupLocations && !multiLocationAcknowledged) ? 'Acknowledge Multiple Pickups' : !user ? 'Sign In to Checkout' : !selectedPaymentMethod ? 'Select Payment Method' : selectedPaymentMethod === 'stripe' ? 'Pay Now' : selectedPaymentMethod === 'cash' ? 'Place Order' : `Pay with ${paymentMethods.find(m => m.id === selectedPaymentMethod)?.name || 'External'}`}
              </button>

              {/* Security messaging */}
              <div style={{
                marginTop: spacing.sm,
                padding: spacing.xs,
                backgroundColor: colors.primaryLight,
                borderRadius: radius.sm,
                border: `1px solid ${colors.primary}`
              }}>
                <div style={{ display: 'flex', gap: spacing['2xs'], alignItems: 'flex-start' }}>
                  <span style={{ fontSize: typography.sizes.base }}>🔒</span>
                  <div>
                    <p style={{
                      margin: `0 0 ${spacing['3xs']} 0`,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      color: colors.textPrimary
                    }}>
                      Your payment is secure
                    </p>
                    <p style={{
                      margin: 0,
                      fontSize: typography.sizes.xs,
                      color: colors.textSecondary,
                      lineHeight: typography.leading.normal
                    }}>
                      We use Stripe, trusted by millions worldwide. Your payment info is encrypted and never stored on our servers.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Responsive Styles */}
      <style>{`
        .checkout-page .checkout-grid {
          grid-template-columns: 1fr;
        }
        .checkout-page .order-summary {
          order: -1;
        }
        @media (min-width: 1024px) {
          .checkout-page .checkout-grid {
            grid-template-columns: 1fr 380px;
          }
          .checkout-page .order-summary {
            order: 0;
          }
        }
      `}</style>
    </div>
  )
}
