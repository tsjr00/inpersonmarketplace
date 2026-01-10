'use client'

import { useCart } from '@/lib/hooks/useCart'

interface CartButtonProps {
  primaryColor?: string
}

export function CartButton({ primaryColor = '#333' }: CartButtonProps) {
  const { itemCount, setIsOpen } = useCart()

  return (
    <button
      onClick={() => setIsOpen(true)}
      style={{
        position: 'relative',
        padding: '8px 12px',
        backgroundColor: 'transparent',
        border: `1px solid ${primaryColor}`,
        borderRadius: 6,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        color: primaryColor,
        fontWeight: 600,
        fontSize: 14,
      }}
    >
      <span style={{ fontSize: 18 }}>🛒</span>
      <span>Cart</span>
      {itemCount > 0 && (
        <span style={{
          position: 'absolute',
          top: -8,
          right: -8,
          minWidth: 20,
          height: 20,
          padding: '0 6px',
          backgroundColor: '#dc3545',
          color: 'white',
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {itemCount > 99 ? '99+' : itemCount}
        </span>
      )}
    </button>
  )
}
