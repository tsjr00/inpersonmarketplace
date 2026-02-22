'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface Vendor {
  vendor_profile_id: string
  business_name: string
  profile_image_url: string | null
  categories: string[]
  listing_count: number
}

interface MarketVendorsListProps {
  vendors: Vendor[]
  categories: string[]
  vertical: string
}

export default function MarketVendorsList({ vendors, categories, vertical }: MarketVendorsListProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const filteredVendors = selectedCategory === 'all'
    ? vendors
    : vendors.filter(v => v.categories.includes(selectedCategory))

  return (
    <div>
      {/* Category Filter */}
      {categories.length > 0 && (
        <div style={{ marginBottom: spacing.sm }}>
          <label
            htmlFor="category-filter"
            style={{
              display: 'block',
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.medium,
              color: colors.textSecondary,
              marginBottom: spacing['2xs']
            }}
          >
            Filter by Category
          </label>
          <select
            id="category-filter"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              padding: `${spacing.xs} ${spacing.sm}`,
              fontSize: typography.sizes.base,
              borderRadius: radius.md,
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.surfaceElevated,
              color: colors.textPrimary,
              minWidth: 200,
              minHeight: 44,
              cursor: 'pointer'
            }}
          >
            <option value="all">All Categories ({vendors.length})</option>
            {categories.map(cat => {
              const count = vendors.filter(v => v.categories.includes(cat)).length
              return (
                <option key={cat} value={cat}>
                  {cat} ({count})
                </option>
              )
            })}
          </select>
        </div>
      )}

      {/* Vendors List */}
      {filteredVendors.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {filteredVendors.map((vendor) => (
            <Link
              key={vendor.vendor_profile_id}
              href={`/${vertical}/vendor/${vendor.vendor_profile_id}/profile`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `${spacing.sm} ${spacing.md}`,
                backgroundColor: colors.surfaceMuted,
                borderRadius: radius.md,
                textDecoration: 'none',
                transition: 'background-color 0.15s ease',
                minHeight: 56
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = colors.surfaceSubtle
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = colors.surfaceMuted
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                {/* Vendor Avatar */}
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: radius.full,
                  backgroundColor: colors.primaryLight,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: colors.primaryDark,
                  fontWeight: typography.weights.semibold,
                  fontSize: typography.sizes.sm,
                  overflow: 'hidden',
                  position: 'relative'
                }}>
                  {vendor.profile_image_url ? (
                    <Image
                      src={vendor.profile_image_url}
                      alt={vendor.business_name}
                      fill
                      sizes="40px"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    vendor.business_name.charAt(0).toUpperCase()
                  )}
                </div>

                {/* Vendor Name */}
                <span style={{
                  fontWeight: typography.weights.semibold,
                  color: colors.primary,
                  fontSize: typography.sizes.base
                }}>
                  {vendor.business_name}
                </span>
              </div>

              {/* Category Tags */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: spacing['2xs'],
                justifyContent: 'flex-end',
                maxWidth: '60%'
              }}>
                {vendor.categories.slice(0, 3).map(cat => (
                  <span
                    key={cat}
                    style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      backgroundColor: colors.primaryLight,
                      color: colors.primaryDark,
                      borderRadius: radius.full,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.medium,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {cat}
                  </span>
                ))}
                {vendor.categories.length > 3 && (
                  <span
                    style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      backgroundColor: colors.surfaceSubtle,
                      color: colors.textMuted,
                      borderRadius: radius.full,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.medium
                    }}
                  >
                    +{vendor.categories.length - 3}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p style={{ color: colors.textSecondary, margin: 0 }}>
          {selectedCategory === 'all'
            ? 'No vendors with active listings at this market yet.'
            : `No vendors selling ${selectedCategory} at this market.`}
        </p>
      )}
    </div>
  )
}
