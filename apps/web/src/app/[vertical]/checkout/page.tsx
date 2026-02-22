'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCart } from '@/lib/hooks/useCart'
import { ErrorDisplay } from '@/components/ErrorFeedback'
import { calculateDisplayPrice, formatPrice, FEES } from '@/lib/constants'
import { calculateSmallOrderFee, getSmallOrderFeeConfig } from '@/lib/pricing'
import { colors, statusColors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import { TipSelector } from './TipSelector'
import { CheckoutListingItem } from './CheckoutListingItem'
import { CheckoutMarketBoxItem } from './CheckoutMarketBoxItem'
import { CrossSellSection } from './CrossSellSection'
import { PaymentMethodSelector } from './PaymentMethodSelector'
import type { CheckoutItem, SuggestedProduct, PaymentMethod, VendorPaymentInfo } from './types'

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
  const [, setVendorPaymentInfo] = useState<VendorPaymentInfo[]>([])
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null)
  const [validationFailed, setValidationFailed] = useState(false)
  const [tipPercentage, setTipPercentage] = useState<number>(0)
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
          small_order_fee: (data.small_order_fee_cents || 0).toString(),
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

  // Small order fee (replaces hard minimum block)
  const smallOrderFeeCents = calculateSmallOrderFee(baseSubtotal, vertical)
  const hasSmallOrderFee = smallOrderFeeCents > 0
  const smallOrderFeeConfig = getSmallOrderFeeConfig(vertical)

  // Total = displayed subtotal + flat fee + small order fee + tip
  const total = displaySubtotal + FEES.buyerFlatFeeCents + smallOrderFeeCents + tipAmountCents

  // Check if all items are available
  const hasUnavailableItems = checkoutItems.some(item => !item.available)

  // Checkout button disabled state
  const checkoutDisabled = processing || validationFailed || hasUnavailableItems || !marketValid || hasScheduleIssues || (hasMultiplePickupLocations && !multiLocationAcknowledged) || !!(user && !selectedPaymentMethod)

  // Checkout button label
  const checkoutLabel = processing ? 'Processing...' : validationFailed ? 'Validation Required' : !marketValid ? 'Fix Market Issues' : hasScheduleIssues ? 'Remove Unavailable Items' : (hasMultiplePickupLocations && !multiLocationAcknowledged) ? 'Acknowledge Multiple Pickups' : !user ? 'Sign In to Checkout' : !selectedPaymentMethod ? 'Select Payment Method' : selectedPaymentMethod === 'stripe' ? 'Pay Now' : selectedPaymentMethod === 'cash' ? 'Place Order' : `Pay with ${paymentMethods.find(m => m.id === selectedPaymentMethod)?.name || 'External'}`

  // Item action handlers that bridge cart items ↔ checkout items
  async function handleQuantityChange(listingId: string, newQuantity: number) {
    const cartItem = items.find(ci => ci.listingId === listingId)
    if (cartItem) {
      setUpdatingItemId(listingId)
      try { await updateQuantity(cartItem.id, newQuantity) } finally { setUpdatingItemId(null) }
    }
  }

  function handleRemoveListing(listingId: string) {
    const cartItem = items.find(ci => ci.listingId === listingId)
    if (cartItem) removeFromCart(cartItem.id)
  }

  function handleRemoveMarketBox(offeringId: string) {
    const cartItem = items.find(ci => ci.offeringId === offeringId)
    if (cartItem) removeFromCart(cartItem.id)
  }

  const listingItems = checkoutItems.filter(i => i.itemType !== 'market_box')
  const marketBoxCheckoutItems = checkoutItems.filter(i => i.itemType === 'market_box')

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
      style={{ minHeight: '100vh', backgroundColor: colors.surfaceBase }}
      className="checkout-page"
    >
      {/* Header */}
      <div style={{
        backgroundColor: colors.surfaceElevated,
        borderBottom: `1px solid ${colors.border}`,
        padding: spacing.sm,
      }}>
        <div style={{ maxWidth: containers.lg, margin: '0 auto' }}>
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
        <div className="checkout-grid" style={{ display: 'grid', gap: spacing.md }}>
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
              {hasMarketBoxItems && listingItems.length > 0 && (
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
              {listingItems.map(item => (
                <CheckoutListingItem
                  key={item.listingId}
                  item={item}
                  updatingItemId={updatingItemId}
                  onQuantityChange={handleQuantityChange}
                  onRemove={handleRemoveListing}
                />
              ))}

              {/* Market Box items */}
              {marketBoxCheckoutItems.length > 0 && (
                <>
                  {listingItems.length > 0 && (
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
                  {marketBoxCheckoutItems.map(item => (
                    <CheckoutMarketBoxItem
                      key={item.offeringId}
                      item={item}
                      onRemove={handleRemoveMarketBox}
                    />
                  ))}
                </>
              )}
            </div>

            <CrossSellSection products={suggestedProducts} vertical={vertical} />
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

                {/* Small Order Fee */}
                {hasSmallOrderFee && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: spacing['2xs'],
                    fontSize: typography.sizes.sm,
                    color: colors.textMuted,
                  }}>
                    <span>Small Order Fee</span>
                    <span>{formatPrice(smallOrderFeeCents)}</span>
                  </div>
                )}

                {/* Tip Selector — Food trucks only */}
                {vertical === 'food_trucks' && baseSubtotal > 0 && (
                  <TipSelector
                    tipPercentage={tipPercentage}
                    onTipChange={setTipPercentage}
                    tipAmountCents={tipAmountCents}
                  />
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

              <PaymentMethodSelector
                methods={paymentMethods}
                selected={selectedPaymentMethod}
                onSelect={setSelectedPaymentMethod}
              />

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

              {hasSmallOrderFee && (
                <div style={{
                  padding: spacing.sm,
                  backgroundColor: statusColors.infoLight,
                  border: `1px solid ${statusColors.infoBorder}`,
                  borderRadius: radius.md,
                  marginBottom: spacing.sm,
                  fontSize: typography.sizes.sm,
                  color: statusColors.infoDark,
                }}>
                  A {formatPrice(smallOrderFeeCents)} small order fee applies to orders under {formatPrice(smallOrderFeeConfig.thresholdCents)}. To avoid this fee, add another item.
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
                disabled={checkoutDisabled}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: `${spacing.sm} ${spacing.md}`,
                  fontSize: typography.sizes.base,
                  fontWeight: typography.weights.semibold,
                  backgroundColor: checkoutDisabled ? colors.border : colors.primary,
                  color: colors.textInverse,
                  border: 'none',
                  borderRadius: radius.sm,
                  cursor: checkoutDisabled ? 'not-allowed' : 'pointer',
                  minHeight: 48,
                  boxShadow: checkoutDisabled ? 'none' : shadows.primary,
                }}
              >
                {checkoutLabel}
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
