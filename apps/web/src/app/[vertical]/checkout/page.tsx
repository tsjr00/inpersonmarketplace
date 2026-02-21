'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCart } from '@/lib/hooks/useCart'
import { ErrorDisplay } from '@/components/ErrorFeedback'
import { calculateBuyerPrice, calculateDisplayPrice, formatPrice, FEES } from '@/lib/constants'
import { getMinimumOrderCents } from '@/lib/pricing'
import { colors, statusColors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { formatPickupDate, getPickupDateColor } from '@/types/pickup'
import { term } from '@/lib/vertical'

interface CheckoutItem {
  itemType?: 'listing' | 'market_box'
  listingId: string | null
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
  schedule_id?: string | null
  pickup_date?: string | null  // YYYY-MM-DD format
  pickup_display?: {
    date_formatted: string
    time_formatted: string | null
    day_name: string | null
  } | null
  // Market box fields
  offeringId?: string | null
  offeringName?: string | null
  termWeeks?: number | null
  startDate?: string | null
  termPriceCents?: number | null
  pickupDayOfWeek?: number | null
  pickupStartTime?: string | null
  pickupEndTime?: string | null
}

interface SuggestedProduct {
  id: string
  title: string
  price_cents: number
  image_urls?: string[] | null
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
  const { items, clearCart, removeFromCart, updateQuantity, hasMultiplePickupLocations, hasScheduleIssues, hasMarketBoxItems } = useCart()

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
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null)
  const [validationFailed, setValidationFailed] = useState(false)
  const [tipPercentage, setTipPercentage] = useState<number>(0)
  const [customTipInput, setCustomTipInput] = useState<string>('')
  const [showCustomTip, setShowCustomTip] = useState(false)
  const [unresolvedExternalCount, setUnresolvedExternalCount] = useState(0)

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

        // Separate listing items from market box items
        const listingItems = items.filter(i => i.itemType !== 'market_box')
        const marketBoxItems = items.filter(i => i.itemType === 'market_box')

        // Market box items are pre-validated at add-to-cart time
        const marketBoxCheckoutItems: CheckoutItem[] = marketBoxItems.map(item => ({
          itemType: 'market_box',
          listingId: null,
          quantity: 1,
          title: item.offeringName || item.title || 'Market Box',
          price_cents: item.termPriceCents || item.price_cents || 0,
          vendor_name: item.vendor_name || 'Unknown Vendor',
          available: true,
          available_quantity: null,
          market_id: item.market_id,
          market_name: item.market_name,
          market_type: item.market_type,
          market_city: item.market_city,
          market_state: item.market_state,
          offeringId: item.offeringId,
          offeringName: item.offeringName,
          termWeeks: item.termWeeks,
          startDate: item.startDate,
          termPriceCents: item.termPriceCents,
          pickupDayOfWeek: item.pickupDayOfWeek,
          pickupStartTime: item.pickupStartTime,
          pickupEndTime: item.pickupEndTime,
          pickup_display: item.pickup_display,
        }))

        // Only validate listing items (market box items skip validation)
        if (listingItems.length === 0) {
          setCheckoutItems(marketBoxCheckoutItems)
          setValidationFailed(false)
          setLoading(false)
          return
        }

        const response = await fetch('/api/cart/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: listingItems.map(item => ({
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
            const cartItem = listingItems.find(i =>
              i.listingId === validatedItem.listingId &&
              i.schedule_id === validatedItem.schedule_id &&
              i.pickup_date === validatedItem.pickup_date
            ) || listingItems.find(i => i.listingId === validatedItem.listingId)
            return {
              ...validatedItem,
              itemType: 'listing' as const,
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
          setCheckoutItems([...mergedItems, ...marketBoxCheckoutItems])
          setValidationFailed(false)
        } else {
          // Validation failed — show items but block checkout
          setValidationFailed(true)
          setCheckoutItems([
            ...listingItems.map(item => ({
              itemType: 'listing' as const,
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
            })),
            ...marketBoxCheckoutItems
          ])
        }
      } catch (err) {
        console.error('Cart validation error:', err)
        setValidationFailed(true)
        const listingItems = items.filter(i => i.itemType !== 'market_box')
        const marketBoxItems = items.filter(i => i.itemType === 'market_box')
        setCheckoutItems([
          ...listingItems.map(item => ({
            itemType: 'listing' as const,
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
          })),
          ...marketBoxItems.map(item => ({
            itemType: 'market_box' as const,
            listingId: null,
            quantity: 1,
            title: item.offeringName || item.title || 'Market Box',
            price_cents: item.termPriceCents || item.price_cents || 0,
            vendor_name: item.vendor_name || 'Unknown Vendor',
            available: true,
            available_quantity: null,
            offeringId: item.offeringId,
            offeringName: item.offeringName,
            termWeeks: item.termWeeks,
            startDate: item.startDate,
            termPriceCents: item.termPriceCents,
          }))
        ])
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
  // Market box items force Stripe-only (no external payments)
  useEffect(() => {
    async function fetchPaymentMethods() {
      if (checkoutItems.length === 0) {
        setPaymentMethods([])
        setVendorPaymentInfo([])
        return
      }

      // Market boxes require Stripe — no external payment options
      const cartHasMarketBox = checkoutItems.some(i => i.itemType === 'market_box')
      if (cartHasMarketBox) {
        setPaymentMethods([{
          id: 'stripe',
          name: 'Credit/Debit Card',
          icon: '💳',
          description: 'Pay securely with card'
        }])
        setSelectedPaymentMethod('stripe')
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

  // Check for unresolved external payment orders (non-blocking warning)
  useEffect(() => {
    async function checkUnresolvedExternalOrders() {
      if (!user) return
      try {
        const res = await fetch(`/api/buyer/orders?vertical=${vertical}`)
        if (res.ok) {
          const data = await res.json()
          const unresolved = (data.orders || []).filter((o: { payment_method: string; status: string }) =>
            o.payment_method && o.payment_method !== 'stripe' && o.status === 'handed_off'
          )
          setUnresolvedExternalCount(unresolved.length)
        }
      } catch {
        // Non-critical — don't block checkout on failure
      }
    }
    checkUnresolvedExternalOrders()
  }, [user, vertical])

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

      // Stripe checkout flow — include both listing and market box items
      const listingCheckoutItems = checkoutItems.filter(i => i.itemType !== 'market_box')
      const marketBoxCheckoutItems = checkoutItems.filter(i => i.itemType === 'market_box')

      const response = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: listingCheckoutItems.map(item => ({
            listingId: item.listingId,
            quantity: item.quantity,
            scheduleId: item.schedule_id,
            pickupDate: item.pickup_date,
          })),
          marketBoxItems: marketBoxCheckoutItems.map(item => ({
            offeringId: item.offeringId,
            termWeeks: item.termWeeks,
            startDate: item.startDate,
            priceCents: item.termPriceCents || item.price_cents,
          })),
          vertical,
          tipAmountCents,
          tipPercentage,
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
    if (item.itemType === 'market_box') {
      return sum + (item.termPriceCents || item.price_cents || 0)
    }
    return sum + item.price_cents * item.quantity
  }, 0)

  // Display subtotal = sum of per-item display prices (includes buyer % fee, per-item rounding)
  // This matches what's shown next to each item AND what Stripe charges
  const displaySubtotal = checkoutItems.reduce((sum, item) => {
    if (item.itemType === 'market_box') {
      return sum + calculateDisplayPrice(item.termPriceCents || item.price_cents || 0)
    }
    return sum + calculateDisplayPrice(item.price_cents) * item.quantity
  }, 0)

  // Tip calculation (food trucks only, on displayed subtotal so math matches what customer sees)
  const tipAmountCents = vertical === 'food_trucks' ? Math.round(displaySubtotal * tipPercentage / 100) : 0

  // Total = displayed subtotal + flat fee + tip
  const total = displaySubtotal + FEES.buyerFlatFeeCents + tipAmountCents
  const minimumCents = getMinimumOrderCents(vertical as string)
  const belowMinimum = baseSubtotal < minimumCents
  const amountNeeded = belowMinimum ? ((minimumCents - baseSubtotal) / 100).toFixed(2) : '0'

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
            {term(vertical, 'browse_products_cta')}
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

            {validationFailed && (
              <div style={{
                padding: spacing.sm,
                backgroundColor: statusColors.dangerLight,
                border: `2px solid ${statusColors.danger}`,
                borderRadius: radius.md,
                marginBottom: spacing.sm,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: spacing.sm,
              }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, color: statusColors.dangerDark, fontSize: typography.sizes.sm }}>
                    Could not verify item availability
                  </p>
                  <p style={{ margin: `${spacing['3xs']} 0 0`, color: statusColors.dangerDark, fontSize: typography.sizes.xs }}>
                    Checkout is disabled until items can be validated. Please retry.
                  </p>
                </div>
                <button
                  onClick={() => window.location.reload()}
                  style={{
                    padding: `${spacing.xs} ${spacing.sm}`,
                    backgroundColor: statusColors.danger,
                    color: 'white',
                    border: 'none',
                    borderRadius: radius.sm,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: typography.sizes.sm,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Retry
                </button>
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
                  {term(vertical, 'market')} Compatibility Issues:
                </p>
                <ul style={{ margin: 0, paddingLeft: spacing.md, color: colors.textSecondary }}>
                  {marketWarnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
              {/* Market box notice */}
              {hasMarketBoxItems && checkoutItems.some(i => i.itemType !== 'market_box') && (
                <div style={{
                  padding: spacing.xs,
                  backgroundColor: statusColors.infoLight,
                  border: `1px solid ${statusColors.infoBorder}`,
                  borderRadius: radius.md,
                  color: statusColors.infoDark,
                  fontSize: typography.sizes.xs,
                }}>
                  This order includes {term(vertical, 'market_box')} subscriptions. Card payment is required.
                </div>
              )}

              {/* Listing items */}
              {checkoutItems.filter(i => i.itemType !== 'market_box').map(item => (
                <div
                  key={item.listingId}
                  style={{
                    padding: spacing.sm,
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: radius.md,
                    border: item.available ? `1px solid ${colors.border}` : `2px solid ${statusColors.danger}`,
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
                          <span>{item.market_type === 'event' ? '🎪' : item.market_type === 'traditional' ? '🏪' : '📦'}</span>
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
                          backgroundColor: statusColors.dangerLight,
                          color: statusColors.dangerDark,
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
                            onClick={async () => {
                              const cartItem = items.find(ci => ci.listingId === item.listingId)
                              if (cartItem) {
                                setUpdatingItemId(item.listingId)
                                try { await updateQuantity(cartItem.id, item.quantity - 1) } finally { setUpdatingItemId(null) }
                              }
                            }}
                            disabled={updatingItemId === item.listingId}
                            style={{
                              width: 36,
                              height: 36,
                              border: `1px solid ${colors.border}`,
                              borderRadius: `${radius.sm} 0 0 ${radius.sm}`,
                              backgroundColor: colors.surfaceElevated,
                              cursor: updatingItemId === item.listingId ? 'default' : 'pointer',
                              fontSize: typography.sizes.lg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: colors.textPrimary,
                              opacity: updatingItemId === item.listingId ? 0.5 : 1,
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
                            onClick={async () => {
                              const cartItem = items.find(ci => ci.listingId === item.listingId)
                              if (cartItem) {
                                setUpdatingItemId(item.listingId)
                                try { await updateQuantity(cartItem.id, item.quantity + 1) } finally { setUpdatingItemId(null) }
                              }
                            }}
                            disabled={updatingItemId === item.listingId || (item.available_quantity !== null && item.quantity >= item.available_quantity)}
                            style={{
                              width: 36,
                              height: 36,
                              border: `1px solid ${colors.border}`,
                              borderRadius: `0 ${radius.sm} ${radius.sm} 0`,
                              backgroundColor: colors.surfaceElevated,
                              cursor: (updatingItemId === item.listingId || (item.available_quantity !== null && item.quantity >= item.available_quantity)) ? 'not-allowed' : 'pointer',
                              fontSize: typography.sizes.lg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: (updatingItemId === item.listingId || (item.available_quantity !== null && item.quantity >= item.available_quantity)) ? 0.5 : 1,
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
                          color: statusColors.danger,
                          border: `1px solid ${statusColors.danger}`,
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

              {/* Market Box items */}
              {checkoutItems.filter(i => i.itemType === 'market_box').length > 0 && (
                <>
                  {checkoutItems.some(i => i.itemType !== 'market_box') && (
                    <div style={{
                      borderTop: `1px solid ${colors.border}`,
                      paddingTop: spacing.xs,
                      marginTop: spacing['2xs'],
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      color: colors.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      {term(vertical, 'market_box')} Subscriptions
                    </div>
                  )}
                  {checkoutItems.filter(i => i.itemType === 'market_box').map(item => {
                    const termLabel = item.termWeeks === 8 ? '8-week' : '4-week'
                    const displayPrice = calculateDisplayPrice(item.termPriceCents || item.price_cents || 0)
                    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

                    return (
                      <div
                        key={item.offeringId}
                        style={{
                          padding: spacing.sm,
                          backgroundColor: statusColors.neutral50,
                          borderRadius: radius.md,
                          border: `1px solid ${statusColors.infoBorder}`,
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'], marginBottom: spacing['3xs'] }}>
                              <span style={{ fontSize: typography.sizes.sm }}>📦</span>
                              <h3 style={{
                                margin: 0,
                                fontSize: typography.sizes.base,
                                color: colors.textPrimary,
                              }}>
                                {item.offeringName || item.title}
                              </h3>
                            </div>
                            <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm, margin: `0 0 ${spacing['2xs']} 0` }}>
                              {item.vendor_name} · {termLabel} subscription
                            </p>

                            {/* Pickup schedule */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: spacing['2xs'],
                              padding: `${spacing['2xs']} ${spacing.xs}`,
                              backgroundColor: statusColors.infoLight,
                              borderRadius: radius.sm,
                              fontSize: typography.sizes.xs,
                              color: statusColors.infoDark,
                            }}>
                              <span>📅</span>
                              <span>
                                <strong>Pickup:</strong>{' '}
                                {item.pickupDayOfWeek != null ? DAY_NAMES[item.pickupDayOfWeek] + 's' : 'TBD'}
                                {item.pickup_display?.time_formatted && ` · ${item.pickup_display.time_formatted}`}
                                {item.market_name && (
                                  <span style={{ display: 'block', marginTop: 2, color: colors.textMuted }}>
                                    @ {item.market_name}
                                    {item.market_city && ` - ${item.market_city}, ${item.market_state}`}
                                  </span>
                                )}
                                {item.startDate && (
                                  <span style={{ display: 'block', marginTop: 2, color: colors.textMuted }}>
                                    Starting {new Date(item.startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>

                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <p style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, margin: `0 0 ${spacing['3xs']} 0`, color: colors.textPrimary }}>
                              {formatPrice(displayPrice)}
                            </p>
                            <p style={{ fontSize: typography.sizes.xs, color: colors.textMuted, margin: `0 0 ${spacing['2xs']} 0` }}>
                              {termLabel} total
                            </p>
                            <button
                              onClick={() => {
                                const cartItem = items.find(ci => ci.offeringId === item.offeringId)
                                if (cartItem) removeFromCart(cartItem.id)
                              }}
                              style={{
                                padding: `${spacing['3xs']} ${spacing.xs}`,
                                backgroundColor: colors.surfaceElevated,
                                color: statusColors.danger,
                                border: `1px solid ${statusColors.danger}`,
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
                    )
                  })}
                </>
              )}
            </div>

            {/* Cross-Sell Section */}
            {suggestedProducts.length > 0 && (
              <div style={{
                marginTop: spacing.md,
                backgroundColor: colors.primaryLight,
                borderRadius: radius.md,
                padding: spacing.md,
                border: `2px solid ${colors.border}`
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
                        border: `1px solid ${colors.border}`,
                        boxShadow: shadows.sm,
                      }}
                    >
                      {/* Product image */}
                      <div style={{
                        width: '100%',
                        height: 80,
                        backgroundColor: colors.surfaceMuted,
                        borderRadius: radius.sm,
                        marginBottom: spacing['2xs'],
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: typography.sizes['2xl'],
                        overflow: 'hidden',
                      }}>
                        {product.image_urls?.[0] ? (
                          <img
                            src={product.image_urls[0]}
                            alt={product.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          '📦'
                        )}
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
                          backgroundColor: colors.primary,
                          color: colors.textInverse,
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
                  <span>Subtotal ({checkoutItems.reduce((s, i) => s + (i.itemType === 'market_box' ? 1 : i.quantity), 0)} items)</span>
                  <span>{formatPrice(displaySubtotal)}</span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: spacing['2xs'],
                  fontSize: typography.sizes.sm,
                  color: colors.textMuted,
                }}>
                  <span>Service Fee</span>
                  <span>{formatPrice(FEES.buyerFlatFeeCents)}</span>
                </div>

                {/* Tip Selector — Food trucks only */}
                {vertical === 'food_trucks' && baseSubtotal > 0 && (
                  <div style={{
                    marginBottom: spacing['2xs'],
                    padding: spacing.xs,
                    backgroundColor: colors.surfaceMuted,
                    borderRadius: radius.sm,
                    border: `1px solid ${colors.border}`,
                  }}>
                    <div style={{
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      color: colors.textPrimary,
                      marginBottom: spacing['2xs'],
                    }}>
                      Add a tip
                    </div>
                    <div style={{
                      fontSize: typography.sizes.xs,
                      color: colors.textMuted,
                      marginBottom: spacing['2xs'],
                    }}>
                      Your tip goes directly to the vendor
                    </div>
                    <div style={{
                      display: 'flex',
                      gap: 4,
                      flexWrap: 'wrap',
                    }}>
                      {[
                        { label: 'No Tip', value: 0 },
                        { label: '10%', value: 10 },
                        { label: '15%', value: 15 },
                        { label: '20%', value: 20 },
                      ].map(option => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setTipPercentage(option.value)
                            setShowCustomTip(false)
                            setCustomTipInput('')
                          }}
                          style={{
                            flex: 1,
                            minWidth: 52,
                            padding: `${spacing['2xs']} ${spacing['2xs']}`,
                            border: tipPercentage === option.value && !showCustomTip
                              ? `2px solid ${colors.primary}`
                              : `1px solid ${colors.border}`,
                            borderRadius: radius.sm,
                            backgroundColor: tipPercentage === option.value && !showCustomTip
                              ? colors.primaryLight
                              : colors.surfaceElevated,
                            cursor: 'pointer',
                            fontSize: typography.sizes.xs,
                            fontWeight: tipPercentage === option.value && !showCustomTip
                              ? typography.weights.semibold
                              : typography.weights.normal,
                            color: colors.textPrimary,
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomTip(true)
                          setCustomTipInput(tipPercentage > 0 ? String(tipPercentage) : '')
                        }}
                        style={{
                          flex: 1,
                          minWidth: 52,
                          padding: `${spacing['2xs']} ${spacing['2xs']}`,
                          border: showCustomTip
                            ? `2px solid ${colors.primary}`
                            : `1px solid ${colors.border}`,
                          borderRadius: radius.sm,
                          backgroundColor: showCustomTip ? colors.primaryLight : colors.surfaceElevated,
                          cursor: 'pointer',
                          fontSize: typography.sizes.xs,
                          fontWeight: showCustomTip ? typography.weights.semibold : typography.weights.normal,
                          color: colors.textPrimary,
                        }}
                      >
                        Custom
                      </button>
                    </div>
                    {showCustomTip && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing['2xs'],
                        marginTop: spacing['2xs'],
                      }}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={customTipInput}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '')
                            setCustomTipInput(val)
                            const num = parseInt(val, 10)
                            setTipPercentage(isNaN(num) ? 0 : Math.min(num, 100))
                          }}
                          placeholder="0"
                          style={{
                            width: 60,
                            padding: `${spacing['2xs']} ${spacing.xs}`,
                            border: `1px solid ${colors.border}`,
                            borderRadius: radius.sm,
                            fontSize: typography.sizes.sm,
                            textAlign: 'center',
                          }}
                        />
                        <span style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>%</span>
                      </div>
                    )}
                    {tipAmountCents > 0 && (
                      <div style={{
                        marginTop: spacing['2xs'],
                        fontSize: typography.sizes.xs,
                        color: colors.textSecondary,
                      }}>
                        Tip: {formatPrice(tipAmountCents)}
                      </div>
                    )}
                  </div>
                )}

                {/* Tip line in summary (when tip > 0) */}
                {tipAmountCents > 0 && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: spacing['2xs'],
                    fontSize: typography.sizes.sm,
                    color: colors.textMuted,
                  }}>
                    <span>Tip ({tipPercentage}%)</span>
                    <span>{formatPrice(tipAmountCents)}</span>
                  </div>
                )}

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
                  backgroundColor: statusColors.dangerLight,
                  border: `1px solid ${statusColors.dangerBorder}`,
                  borderRadius: radius.md,
                  marginBottom: spacing.sm,
                  fontSize: typography.sizes.sm,
                  color: statusColors.dangerDark,
                }}>
                  Some items in your cart are no longer available. Please remove them to continue.
                </div>
              )}

              {belowMinimum && (
                <div style={{
                  padding: spacing.sm,
                  backgroundColor: statusColors.warningLight,
                  border: `1px solid ${statusColors.warningBorder}`,
                  borderRadius: radius.md,
                  marginBottom: spacing.sm,
                  fontSize: typography.sizes.sm,
                  color: statusColors.warningDark,
                }}>
                  Minimum order is {formatPrice(minimumCents)}. Add ${amountNeeded} more to your cart.
                </div>
              )}

              {/* Multi-Location Acknowledgment Notice */}
              {hasMultiplePickupLocations && !multiLocationAcknowledged && (
                <div style={{
                  padding: spacing.sm,
                  backgroundColor: statusColors.warningLight,
                  border: `2px solid ${statusColors.warningBorder}`,
                  borderRadius: radius.md,
                  marginBottom: spacing.sm,
                }}>
                  <p style={{
                    margin: `0 0 ${spacing.xs} 0`,
                    fontWeight: typography.weights.bold,
                    color: statusColors.warningDark,
                    fontSize: typography.sizes.sm,
                  }}>
                    📍 Multiple Pickup Locations
                  </p>
                  <p style={{
                    margin: `0 0 ${spacing.xs} 0`,
                    color: statusColors.warningDark,
                    fontSize: typography.sizes.sm,
                  }}>
                    Your order has items from different locations. You&apos;ll visit each to collect:
                  </p>
                  <div style={{ margin: `0 0 ${spacing.xs} 0`, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[...new Map(checkoutItems.filter(i => i.market_name).map(i => [i.market_id, i])).values()].map(item => (
                      <div key={item.market_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: typography.sizes.xs, color: statusColors.warningDark }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          backgroundColor: item.market_type === 'event' ? '#f59e0b' : item.market_type === 'private_pickup' ? colors.primary : statusColors.info,
                          flexShrink: 0
                        }} />
                        <strong>{item.market_name}</strong>
                        {item.market_city && ` (${item.market_city}, ${item.market_state})`}
                      </div>
                    ))}
                  </div>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.xs,
                    cursor: 'pointer',
                    fontSize: typography.sizes.sm,
                    color: statusColors.warningDark,
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

              {/* Unresolved External Orders Warning */}
              {unresolvedExternalCount > 0 && (
                <div style={{
                  padding: spacing.sm,
                  backgroundColor: '#ecfdf5',
                  border: `2px solid #10b981`,
                  borderRadius: radius.md,
                  marginBottom: spacing.sm,
                }}>
                  <p style={{
                    margin: 0,
                    fontWeight: typography.weights.semibold,
                    color: '#065f46',
                    fontSize: typography.sizes.sm,
                  }}>
                    You have {unresolvedExternalCount} external payment order{unresolvedExternalCount !== 1 ? 's' : ''} awaiting your confirmation.
                  </p>
                  <Link
                    href={`/${vertical}/buyer/orders`}
                    style={{
                      display: 'inline-block',
                      marginTop: spacing.xs,
                      color: '#065f46',
                      fontSize: typography.sizes.sm,
                      fontWeight: typography.weights.medium,
                      textDecoration: 'underline',
                    }}
                  >
                    Review and confirm your orders →
                  </Link>
                </div>
              )}

              <button
                onClick={handleCheckout}
                disabled={processing || validationFailed || hasUnavailableItems || belowMinimum || !marketValid || hasScheduleIssues || (hasMultiplePickupLocations && !multiLocationAcknowledged) || !!(user && !selectedPaymentMethod)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: `${spacing.sm} ${spacing.md}`,
                  fontSize: typography.sizes.base,
                  fontWeight: typography.weights.semibold,
                  backgroundColor: processing || validationFailed || hasUnavailableItems || belowMinimum || !marketValid || (hasMultiplePickupLocations && !multiLocationAcknowledged) || !!(user && !selectedPaymentMethod) ? colors.border : colors.primary,
                  color: colors.textInverse,
                  border: 'none',
                  borderRadius: radius.sm,
                  cursor: processing || validationFailed || hasUnavailableItems || belowMinimum || !marketValid || hasScheduleIssues || (hasMultiplePickupLocations && !multiLocationAcknowledged) || !!(user && !selectedPaymentMethod) ? 'not-allowed' : 'pointer',
                  minHeight: 48,
                  boxShadow: processing || validationFailed || hasUnavailableItems || belowMinimum || !marketValid || hasScheduleIssues || (hasMultiplePickupLocations && !multiLocationAcknowledged) || !!(user && !selectedPaymentMethod) ? 'none' : shadows.primary,
                }}
              >
                {processing ? 'Processing...' : validationFailed ? 'Validation Required' : belowMinimum ? `Add $${amountNeeded} More` : !marketValid ? 'Fix Market Issues' : hasScheduleIssues ? 'Remove Unavailable Items' : (hasMultiplePickupLocations && !multiLocationAcknowledged) ? 'Acknowledge Multiple Pickups' : !user ? 'Sign In to Checkout' : !selectedPaymentMethod ? 'Select Payment Method' : selectedPaymentMethod === 'stripe' ? 'Pay Now' : selectedPaymentMethod === 'cash' ? 'Place Order' : `Pay with ${paymentMethods.find(m => m.id === selectedPaymentMethod)?.name || 'External'}`}
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
