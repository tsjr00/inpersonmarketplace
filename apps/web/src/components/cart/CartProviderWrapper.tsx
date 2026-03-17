'use client'

import { ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { CartProvider, useCart } from '@/lib/hooks/useCart'

const CartDrawer = dynamic(() => import('./CartDrawer').then(mod => ({ default: mod.CartDrawer })), {
  ssr: false,
})

function CartDrawerLoader() {
  const { isOpen } = useCart()
  if (!isOpen) return null
  return <CartDrawer />
}

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
      <CartDrawerLoader />
    </CartProvider>
  )
}
