'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import AdminNav from '@/components/admin/AdminNav'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'

interface Listing {
  id: string
  title: string
  status: string
  price_cents: number
  category?: string
  created_at: string
  vendor_profiles: {
    id: string
    tier: string
    profile_data: {
      business_name?: string
      farm_name?: string
    }
  }
}

export default function AdminListingsPage() {
  const params = useParams()
  const vertical = params.vertical as string

  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchListings()
  }, [vertical, statusFilter])

  const fetchListings = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/listings?vertical=${vertical}&admin=true${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`)
      if (res.ok) {
        const data = await res.json()
        setListings(data.listings || [])
      }
    } catch (error) {
      console.error('Error fetching listings:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100)
  }

  const filteredListings = listings.filter(listing => {
    if (!searchTerm) return true
    const vendorName = listing.vendor_profiles?.profile_data?.business_name ||
                       listing.vendor_profiles?.profile_data?.farm_name || ''
    return listing.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
           vendorName.toLowerCase().includes(searchTerm.toLowerCase())
  })

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      color: colors.textPrimary,
      padding: spacing.lg
    }}>
      <div style={{ maxWidth: containers.xl, margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: spacing.md,
          paddingBottom: spacing.sm,
          borderBottom: `2px solid ${colors.primary}`
        }}>
          <div>
            <h1 style={{ color: colors.primary, margin: 0, fontSize: typography.sizes['2xl'] }}>
              Listings Management
            </h1>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, margin: `${spacing['3xs']} 0 0 0` }}>
              Browse and moderate vendor product listings
            </p>
          </div>
          <Link
            href={`/${vertical}/admin`}
            style={{
              color: colors.primary,
              textDecoration: 'none',
              fontWeight: typography.weights.medium,
              fontSize: typography.sizes.sm
            }}
          >
            ← Back to Admin
          </Link>
        </div>

        {/* Admin Navigation */}
        <AdminNav type="vertical" vertical={vertical} />

        {/* Filters */}
        <div style={{
          display: 'flex',
          gap: spacing.sm,
          marginBottom: spacing.md,
          flexWrap: 'wrap'
        }}>
          <input
            type="text"
            placeholder="Search listings or vendors..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: `${spacing.xs} ${spacing.sm}`,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              minWidth: 250
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: `${spacing.xs} ${spacing.sm}`,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              backgroundColor: colors.surfaceElevated
            }}
          >
            <option value="all">All Status</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        {/* Results count */}
        <div style={{ marginBottom: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm }}>
          {filteredListings.length} listing{filteredListings.length !== 1 ? 's' : ''} found
        </div>

        {/* Listings Table */}
        <div style={{
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          boxShadow: shadows.sm,
          overflow: 'hidden'
        }}>
          {loading ? (
            <div style={{ padding: spacing.lg, textAlign: 'center', color: colors.textSecondary }}>
              Loading listings...
            </div>
          ) : filteredListings.length === 0 ? (
            <div style={{ padding: spacing.lg, textAlign: 'center', color: colors.textSecondary }}>
              No listings found
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: colors.surfaceSubtle }}>
                  <th style={{ textAlign: 'left', padding: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }}>
                    Title
                  </th>
                  <th style={{ textAlign: 'left', padding: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }}>
                    Vendor
                  </th>
                  <th style={{ textAlign: 'left', padding: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }}>
                    Category
                  </th>
                  <th style={{ textAlign: 'left', padding: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }}>
                    Price
                  </th>
                  <th style={{ textAlign: 'left', padding: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }}>
                    Status
                  </th>
                  <th style={{ textAlign: 'right', padding: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredListings.map((listing) => {
                  const vendorName = listing.vendor_profiles?.profile_data?.business_name ||
                                    listing.vendor_profiles?.profile_data?.farm_name || 'Unknown'

                  return (
                    <tr key={listing.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <td style={{ padding: spacing.sm }}>
                        <div style={{ fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                          {listing.title}
                        </div>
                      </td>
                      <td style={{ padding: spacing.sm }}>
                        <div style={{ color: colors.textPrimary }}>{vendorName}</div>
                        {listing.vendor_profiles?.tier && listing.vendor_profiles.tier !== 'standard' && (
                          <span style={{
                            display: 'inline-block',
                            marginTop: spacing['3xs'],
                            padding: `${spacing['3xs']} ${spacing.xs}`,
                            backgroundColor: listing.vendor_profiles.tier === 'premium' ? '#dbeafe' : '#fef3c7',
                            color: listing.vendor_profiles.tier === 'premium' ? '#1e40af' : '#92400e',
                            borderRadius: radius.sm,
                            fontSize: typography.sizes.xs,
                            fontWeight: typography.weights.semibold
                          }}>
                            {listing.vendor_profiles.tier}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: spacing.sm, color: colors.textSecondary, fontSize: typography.sizes.sm }}>
                        {listing.category || '—'}
                      </td>
                      <td style={{ padding: spacing.sm, color: colors.textPrimary, fontWeight: typography.weights.medium }}>
                        {formatPrice(listing.price_cents)}
                      </td>
                      <td style={{ padding: spacing.sm }}>
                        <span style={{
                          padding: `${spacing['3xs']} ${spacing.xs}`,
                          borderRadius: radius.sm,
                          fontSize: typography.sizes.xs,
                          fontWeight: typography.weights.semibold,
                          backgroundColor:
                            listing.status === 'published' ? '#d1fae5' :
                            listing.status === 'draft' ? '#fef3c7' :
                            '#f3f4f6',
                          color:
                            listing.status === 'published' ? '#065f46' :
                            listing.status === 'draft' ? '#92400e' :
                            '#6b7280'
                        }}>
                          {listing.status}
                        </span>
                      </td>
                      <td style={{ padding: spacing.sm, textAlign: 'right' }}>
                        <Link
                          href={`/${vertical}/listing/${listing.id}`}
                          style={{
                            padding: `${spacing['3xs']} ${spacing.xs}`,
                            backgroundColor: colors.primary,
                            color: 'white',
                            textDecoration: 'none',
                            borderRadius: radius.sm,
                            fontSize: typography.sizes.sm
                          }}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
