'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'

export interface CartItem {
  id: string
  listingId: string
  quantity: number
  title?: string
  price_cents?: number
  vendor_name?: string
  quantity_available?: number | null
  status?: string
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
  addToCart: (listingId: string, quantity?: number) => Promise<void>
  removeFromCart: (cartItemId: string) => Promise<void>
  updateQuantity: (cartItemId: string, quantity: number) => Promise<void>
  clearCart: () => void
  refreshCart: () => Promise<void>
  itemCount: number
  isOpen: boolean
  setIsOpen: (open: boolean) => void
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

  // Clear localStorage cart on mount (migration cleanup)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const oldCart = localStorage.getItem('cart')
      if (oldCart) {
        console.log('Migrating from localStorage cart to database cart...')
        localStorage.removeItem('cart')
      }
    }
  }, [])

  const refreshCart = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/cart?vertical=${vertical}`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
        setSummary(data.summary || { total_items: 0, total_cents: 0, vendor_count: 0 })
      } else if (res.status === 401) {
        // User not logged in - clear cart
        setItems([])
        setSummary({ total_items: 0, total_cents: 0, vendor_count: 0 })
      }
    } catch (error) {
      console.error('Error fetching cart:', error)
    } finally {
      setLoading(false)
    }
  }, [vertical])

  // Fetch cart on mount and vertical change
  useEffect(() => {
    refreshCart()
  }, [refreshCart])

  const addToCart = async (listingId: string, quantity: number = 1) => {
    try {
      const res = await fetch('/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vertical, listingId, quantity })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to add item to cart')
      }

      await refreshCart()
      setIsOpen(true) // Open cart drawer after adding
    } catch (error) {
      console.error('Error adding to cart:', error)
      throw error
    }
  }

  const removeFromCart = async (cartItemId: string) => {
    // Optimistic update - remove from UI immediately
    const previousItems = [...items]
    const previousSummary = { ...summary }

    const itemToRemove = items.find(item => item.id === cartItemId)
    if (itemToRemove) {
      setItems(prevItems => prevItems.filter(item => item.id !== cartItemId))
      setSummary(prev => ({
        ...prev,
        total_items: prev.total_items - itemToRemove.quantity,
        total_cents: prev.total_cents - (itemToRemove.quantity * (itemToRemove.price_cents || 0))
      }))
    }

    try {
      const res = await fetch(`/api/cart/items/${cartItemId}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        // Revert optimistic update on error
        setItems(previousItems)
        setSummary(previousSummary)
        throw new Error('Failed to remove item from cart')
      }
      // Success - no need to refresh
    } catch (error) {
      // Revert on any error
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

    // Optimistic update - update UI immediately
    const previousItems = [...items]
    const previousSummary = { ...summary }

    setItems(prevItems =>
      prevItems.map(item =>
        item.id === cartItemId
          ? { ...item, quantity }
          : item
      )
    )

    // Update summary optimistically
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
        // Revert optimistic update on error
        setItems(previousItems)
        setSummary(previousSummary)
        const error = await res.json()
        throw new Error(error.error || 'Failed to update quantity')
      }
      // Success - no need to refresh, optimistic update is already in place
    } catch (error) {
      // Revert on any error
      setItems(previousItems)
      setSummary(previousSummary)
      console.error('Error updating quantity:', error)
      throw error
    }
  }

  const clearCart = () => {
    setItems([])
    setSummary({ total_items: 0, total_cents: 0, vendor_count: 0 })
  }

  const itemCount = summary.total_items

  return (
    <CartContext.Provider value={{
      items,
      summary,
      loading,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      refreshCart,
      itemCount,
      isOpen,
      setIsOpen
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
