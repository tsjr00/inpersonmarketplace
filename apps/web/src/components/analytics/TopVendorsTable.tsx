'use client'

import React from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface TopVendor {
  vendor_id: string
  name: string
  vertical_id: string | null
  tier: string
  total_sales: number
  revenue: number
}

interface TopVendorsTableProps {
  vendors: TopVendor[]
  showVertical?: boolean
}

export default function TopVendorsTable({
  vendors,
  showVertical = false
}: TopVendorsTableProps) {
  const formatCurrency = (cents: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(cents / 100)
  }

  if (vendors.length === 0) {
    return (
      <div style={{
        padding: spacing.xl,
        textAlign: 'center',
        color: colors.textMuted
      }}>
        No vendor data available for this period
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
            <th style={thStyle}>#</th>
            <th style={thStyle}>Vendor</th>
            {showVertical && <th style={thStyle}>Vertical</th>}
            <th style={thStyle}>Tier</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Sales</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((vendor, index) => (
            <tr key={vendor.vendor_id} style={{ borderBottom: `1px solid ${colors.border}` }}>
              <td style={{ ...tdStyle, color: colors.textMuted, width: 40 }}>
                {index + 1}
              </td>
              <td style={tdStyle}>
                <div style={{ fontWeight: typography.weights.medium, color: colors.textPrimary }}>
                  {vendor.name}
                </div>
              </td>
              {showVertical && (
                <td style={tdStyle}>
                  {vendor.vertical_id ? (
                    <span style={{
                      padding: `${spacing['3xs']} ${spacing['2xs']}`,
                      backgroundColor: colors.surfaceMuted,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.medium
                    }}>
                      {vendor.vertical_id}
                    </span>
                  ) : '—'}
                </td>
              )}
              <td style={tdStyle}>
                <span style={{
                  padding: `${spacing['3xs']} ${spacing['2xs']}`,
                  backgroundColor: vendor.tier === 'premium' ? '#dbeafe' : vendor.tier === 'featured' ? '#fef3c7' : colors.surfaceMuted,
                  color: vendor.tier === 'premium' ? '#1e40af' : vendor.tier === 'featured' ? '#92400e' : colors.textSecondary,
                  borderRadius: radius.sm,
                  fontSize: typography.sizes.xs,
                  fontWeight: typography.weights.semibold
                }}>
                  {vendor.tier}
                </span>
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: typography.weights.medium }}>
                {vendor.total_sales.toLocaleString()}
              </td>
              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: typography.weights.bold, color: colors.primary }}>
                {formatCurrency(vendor.revenue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const thStyle = {
  padding: spacing.sm,
  textAlign: 'left' as const,
  fontWeight: typography.weights.semibold,
  fontSize: typography.sizes.sm,
  color: colors.textSecondary
}

const tdStyle = {
  padding: spacing.sm,
  fontSize: typography.sizes.sm,
  color: colors.textPrimary
}
