'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'

/*
 * CART CONTEXT
 *
 * Supports two item types:
 * - 'listing': Regular marketplace items with pickup scheduling
 * - 'market_box': Market box subscriptions (qty always 1, Stripe-only)
 *
 * See: docs/Build_Instructions/Market_Box_Checkout_Integration_Plan.md
 */

export interface CartItem {
  id: string
  itemType: 'listing' | 'market_box'
  // Listing fields (when itemType === 'listing')
  listingId: string | null
  quantity: number
  title?: string
  price_cents?: number
  vendor_name?: string
  quantity_available?: number | null
  status?: string
  market_id?: string
  market_name?: string
  market_type?: string
  market_city?: string
  market_state?: string
  // Pickup scheduling fields (listings)
  schedule_id?: string | null
  pickup_date?: string | null  // YYYY-MM-DD format
  preferred_pickup_time?: string | null  // HH:MM format for FT time slots
  pickup_display?: {
    date_formatted: string
    time_formatted: string | null
    day_name: string | null
  } | null
  // Schedule validation
  schedule_issue?: string | null
  // Market box fields (when itemType === 'market_box')
  offeringId?: string | null
  offeringName?: string | null
  termWeeks?: number | null
  startDate?: string | null
  termPriceCents?: number | null
  pickupDayOfWeek?: number | null
  pickupStartTime?: string | null
  pickupEndTime?: string | null
}

interface CartSummary {
  total_items: number
  total_cents: number
  vendor_count: number
}

interface CartContextType {
  items: CartItem[]
  summary: CartSummary
  loading: boolean
  addToCart: (
    listingId: string,
    quantity?: number,
    marketId?: string,
    scheduleId?: string,
    pickupDate?: string,
    preferredPickupTime?: string
  ) => Promise<void>
  addMarketBoxToCart: (
    offeringId: string,
    termWeeks: number,
    startDate?: string
  ) => Promise<void>
  removeFromCart: (cartItemId: string) => Promise<void>
  updateQuantity: (cartItemId: string, quantity: number) => Promise<void>
  clearCart: () => void
  refreshCart: () => Promise<void>
  itemCount: number
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  hasMultiplePickupLocations: boolean
  hasMultiplePickupDates: boolean
  hasScheduleIssues: boolean
  hasMarketBoxItems: boolean
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({
  children,
  vertical
}: {
  children: ReactNode
  vertical: string
}) {
  const [items, setItems] = useState<CartItem[]>([])
  const [summary, setSummary] = useState<CartSummary>({
    total_items: 0,
    total_cents: 0,
    vendor_count: 0
  })
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [hasScheduleIssues, setHasScheduleIssues] = useState(false)
  const [hasMarketBoxItems, setHasMarketBoxItems] = useState(false)

  const refreshCart = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/cart?vertical=${vertical}`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
        setSummary(data.summary || { total_items: 0, total_cents: 0, vendor_count: 0 })
        setHasScheduleIssues(data.hasScheduleIssues || false)
        setHasMarketBoxItems(data.hasMarketBoxItems || false)
      } else if (res.status === 401) {
        setItems([])
        setSummary({ total_items: 0, total_cents: 0, vendor_count: 0 })
        setHasScheduleIssues(false)
        setHasMarketBoxItems(false)
      }
    } catch (error) {
      console.error('Error fetching cart:', error)
    } finally {
      setLoading(false)
    }
  }, [vertical])

  useEffect(() => {
    refreshCart()
  }, [refreshCart])

  const addToCart = async (
    listingId: string,
    quantity: number = 1,
    marketId?: string,
    scheduleId?: string,
    pickupDate?: string,
    preferredPickupTime?: string
  ) => {
    try {
      const res = await fetch('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vertical,
          listingId,
          quantity,
          marketId,
          scheduleId,
          pickupDate,
          preferredPickupTime
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to add item to cart')
      }

      await refreshCart()
      setIsOpen(true)
    } catch (error) {
      console.error('Error adding to cart:', error)
      throw error
    }
  }

  const addMarketBoxToCart = async (
    offeringId: string,
    termWeeks: number,
    startDate?: string
  ) => {
    try {
      const res = await fetch('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'market_box',
          vertical,
          offeringId,
          termWeeks,
          startDate
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to add market box to cart')
      }

      await refreshCart()
      setIsOpen(true)
    } catch (error) {
      console.error('Error adding market box to cart:', error)
      throw error
    }
  }

  const removeFromCart = async (cartItemId: string) => {
    const previousItems = [...items]
    const previousSummary = { ...summary }

    const itemToRemove = items.find(item => item.id === cartItemId)
    if (itemToRemove) {
      setItems(prevItems => prevItems.filter(item => item.id !== cartItemId))
      const removedValue = itemToRemove.itemType === 'market_box'
        ? (itemToRemove.termPriceCents || 0)
        : (itemToRemove.quantity * (itemToRemove.price_cents || 0))
      setSummary(prev => ({
        ...prev,
        total_items: prev.total_items - (itemToRemove.itemType === 'market_box' ? 1 : itemToRemove.quantity),
        total_cents: prev.total_cents - removedValue
      }))
    }

    try {
      const res = await fetch(`/api/cart/items/${cartItemId}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        setItems(previousItems)
        setSummary(previousSummary)
        throw new Error('Failed to remove item from cart')
      }
    } catch (error) {
      setItems(previousItems)
      setSummary(previousSummary)
      console.error('Error removing from cart:', error)
      throw error
    }
  }

  const updateQuantity = async (cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      await removeFromCart(cartItemId)
      return
    }

    const previousItems = [...items]
    const previousSummary = { ...summary }

    setItems(prevItems =>
      prevItems.map(item =>
        item.id === cartItemId
          ? { ...item, quantity }
          : item
      )
    )

    const itemBeingUpdated = items.find(item => item.id === cartItemId)
    if (itemBeingUpdated) {
      const quantityDiff = quantity - itemBeingUpdated.quantity
      setSummary(prev => ({
        ...prev,
        total_items: prev.total_items + quantityDiff,
        total_cents: prev.total_cents + (quantityDiff * (itemBeingUpdated.price_cents || 0))
      }))
    }

    try {
      const res = await fetch(`/api/cart/items/${cartItemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity })
      })

      if (!res.ok) {
        setItems(previousItems)
        setSummary(previousSummary)
        const error = await res.json()
        throw new Error(error.error || 'Failed to update quantity')
      }
    } catch (error) {
      setItems(previousItems)
      setSummary(previousSummary)
      console.error('Error updating quantity:', error)
      throw error
    }
  }

  const clearCart = () => {
    setItems([])
    setSummary({ total_items: 0, total_cents: 0, vendor_count: 0 })
    setHasScheduleIssues(false)
    setHasMarketBoxItems(false)
  }

  const itemCount = summary.total_items

  const hasMultiplePickupLocations = (() => {
    const marketIds = new Set(items.map(item => item.market_id).filter(Boolean))
    return marketIds.size > 1
  })()

  const hasMultiplePickupDates = (() => {
    const pickupKeys = new Set(
      items
        .filter(item => item.itemType === 'listing' && item.schedule_id && item.pickup_date)
        .map(item => `${item.schedule_id}-${item.pickup_date}`)
    )
    return pickupKeys.size > 1
  })()

  return (
    <CartContext.Provider value={{
      items,
      summary,
      loading,
      addToCart,
      addMarketBoxToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      refreshCart,
      itemCount,
      isOpen,
      setIsOpen,
      hasMultiplePickupLocations,
      hasMultiplePickupDates,
      hasScheduleIssues,
      hasMarketBoxItems
    }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}
