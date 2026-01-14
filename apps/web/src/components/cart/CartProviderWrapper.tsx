'use client'

import { ReactNode } from 'react'
import { CartProvider } from '@/lib/hooks/useCart'
import { CartDrawer } from './CartDrawer'

export function CartProviderWrapper({
  children,
  vertical
}: {
  children: ReactNode
  vertical: string
}) {
  return (
    <CartProvider vertical={vertical}>
      {children}
      <CartDrawer />
    </CartProvider>
  )
}
