'use client'

import Link from 'next/link'
import Image from 'next/image'
import { calculateDisplayPrice, formatPrice } from '@/lib/constants'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import type { SuggestedProduct } from './types'

interface CrossSellSectionProps {
  products: SuggestedProduct[]
  vertical: string
}

export function CrossSellSection({ products, vertical }: CrossSellSectionProps) {
  if (products.length === 0) return null

  return (
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
        {products.map(product => (
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
              position: 'relative',
            }}>
              {product.image_urls?.[0] ? (
                <Image
                  src={product.image_urls[0]}
                  alt={product.title}
                  fill
                  sizes="64px"
                  style={{ objectFit: 'cover' }}
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
  )
}
