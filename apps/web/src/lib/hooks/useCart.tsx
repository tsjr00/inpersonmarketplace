'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface CartItem {
  listingId: string
  quantity: number
  title?: string
  price_cents?: number
  vendor_name?: string
}

interface CartContextType {
  items: CartItem[]
  addToCart: (listingId: string, quantity: number, listingInfo?: { title?: string; price_cents?: number; vendor_name?: string }) => Promise<void>
  removeFromCart: (listingId: string) => void
  updateQuantity: (listingId: string, quantity: number) => void
  clearCart: () => void
  itemCount: number
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Load cart from localStorage on mount
  useEffect(() => {
    setMounted(true)
    const savedCart = localStorage.getItem('cart')
    if (savedCart) {
      try {
        setItems(JSON.parse(savedCart))
      } catch (err) {
        console.error('Failed to load cart:', err)
      }
    }
  }, [])

  // Save cart to localStorage whenever it changes
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('cart', JSON.stringify(items))
    }
  }, [items, mounted])

  async function addToCart(
    listingId: string,
    quantity: number,
    listingInfo?: { title?: string; price_cents?: number; vendor_name?: string }
  ) {
    try {
      // Optionally verify with API
      const response = await fetch('/api/cart/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, quantity }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to add to cart')
      }

      const data = await response.json()

      setItems(prev => {
        const existing = prev.find(item => item.listingId === listingId)
        if (existing) {
          return prev.map(item =>
            item.listingId === listingId
              ? { ...item, quantity: item.quantity + quantity }
              : item
          )
        }
        return [...prev, {
          listingId,
          quantity,
          title: listingInfo?.title || data.listing?.title,
          price_cents: listingInfo?.price_cents || data.listing?.price_cents,
          vendor_name: listingInfo?.vendor_name || data.listing?.vendor_name,
        }]
      })

      // Open cart drawer after adding
      setIsOpen(true)
    } catch (err) {
      throw err
    }
  }

  function removeFromCart(listingId: string) {
    setItems(prev => prev.filter(item => item.listingId !== listingId))
  }

  function updateQuantity(listingId: string, quantity: number) {
    if (quantity <= 0) {
      removeFromCart(listingId)
      return
    }
    setItems(prev =>
      prev.map(item =>
        item.listingId === listingId ? { ...item, quantity } : item
      )
    )
  }

  function clearCart() {
    setItems([])
  }

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        itemCount,
        isOpen,
        setIsOpen,
      }}
    >
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
