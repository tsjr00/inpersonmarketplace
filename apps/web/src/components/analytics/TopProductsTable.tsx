'use client'

import React, { useState } from 'react'
import Image from 'next/image'

interface TopProduct {
  listing_id: string
  title: string
  image_url: string | null
  total_sold: number
  revenue: number
}

interface TopProductsTableProps {
  products: TopProduct[]
  onProductClick?: (listingId: string) => void
}

type SortKey = 'total_sold' | 'revenue'

export default function TopProductsTable({
  products,
  onProductClick
}: TopProductsTableProps) {
  const [sortBy, setSortBy] = useState<SortKey>('total_sold')

  const sortedProducts = [...products].sort((a, b) => b[sortBy] - a[sortBy])

  const formatCurrency = (cents: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100)
  }

  if (products.length === 0) {
    return (
      <div style={{
        padding: 40,
        textAlign: 'center',
        backgroundColor: '#f9fafb',
        borderRadius: 8,
        color: '#6b7280'
      }}>
        No sales data available for this period
      </div>
    )
  }

  return (
    <div>
      {/* Sort controls */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 12
      }}>
        <button
          onClick={() => setSortBy('total_sold')}
          style={{
            padding: '6px 12px',
            borderRadius: 4,
            border: 'none',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            backgroundColor: sortBy === 'total_sold' ? '#2563eb' : '#e5e7eb',
            color: sortBy === 'total_sold' ? 'white' : '#374151'
          }}
        >
          By Units Sold
        </button>
        <button
          onClick={() => setSortBy('revenue')}
          style={{
            padding: '6px 12px',
            borderRadius: 4,
            border: 'none',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            backgroundColor: sortBy === 'revenue' ? '#2563eb' : '#e5e7eb',
            color: sortBy === 'revenue' ? 'white' : '#374151'
          }}
        >
          By Revenue
        </button>
      </div>

      {/* Products table */}
      <div style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        overflow: 'hidden'
      }}>
        {sortedProducts.map((product, index) => (
          <div
            key={product.listing_id}
            onClick={() => onProductClick?.(product.listing_id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 12,
              borderBottom: index < sortedProducts.length - 1 ? '1px solid #e5e7eb' : 'none',
              backgroundColor: index % 2 === 0 ? 'white' : '#f9fafb',
              cursor: onProductClick ? 'pointer' : 'default'
            }}
          >
            {/* Rank */}
            <div style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              backgroundColor: index < 3 ? '#fbbf24' : '#e5e7eb',
              color: index < 3 ? '#78350f' : '#374151',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 'bold',
              flexShrink: 0
            }}>
              {index + 1}
            </div>

            {/* Image */}
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 4,
              overflow: 'hidden',
              backgroundColor: '#e5e7eb',
              flexShrink: 0
            }}>
              {product.image_url ? (
                <Image
                  src={product.image_url}
                  alt={product.title}
                  width={48}
                  height={48}
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                <div style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#9ca3af',
                  fontSize: 20
                }}>
                  📦
                </div>
              )}
            </div>

            {/* Title */}
            <div style={{
              flex: 1,
              minWidth: 0
            }}>
              <div style={{
                fontSize: 14,
                fontWeight: 500,
                color: '#111827',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {product.title}
              </div>
            </div>

            {/* Stats */}
            <div style={{
              display: 'flex',
              gap: 16,
              flexShrink: 0
            }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Sold</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                  {product.total_sold}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Revenue</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#059669' }}>
                  {formatCurrency(product.revenue)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
