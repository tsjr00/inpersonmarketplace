export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import { getLocale } from '@/lib/locale/server'
import { t } from '@/lib/locale/messages'
import BackLink from '@/components/shared/BackLink'

interface FavoritesPageProps {
  params: Promise<{ vertical: string }>
}

export default async function FavoritesPage({ params }: FavoritesPageProps) {
  const { vertical } = await params
  const supabase = await createClient()
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const locale = await getLocale()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }

  // Get user's favorited vendor profiles with name + logo
  const { data: favorites } = await supabase
    .from('vendor_favorites')
    .select(`
      vendor_profile_id,
      created_at,
      vendor_profiles!inner (
        id,
        profile_data,
        profile_image_url,
        tier,
        average_rating,
        rating_count,
        vertical_id
      )
    `)
    .eq('user_id', user.id)
    .eq('vendor_profiles.vertical_id', vertical)
    .order('created_at', { ascending: false })

  const vendorCards = (favorites || []).map(fav => {
    const vp = fav.vendor_profiles as unknown as {
      id: string
      profile_data: Record<string, unknown>
      profile_image_url: string | null
      tier: string
      average_rating: number | null
      rating_count: number | null
    }
    const name = (vp.profile_data?.business_name as string) ||
                 (vp.profile_data?.farm_name as string) ||
                 'Vendor'
    return {
      id: vp.id,
      name,
      imageUrl: vp.profile_image_url,
      rating: vp.average_rating,
      ratingCount: vp.rating_count,
    }
  })

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
      padding: `${spacing.md} ${spacing.sm}`,
    }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <BackLink fallbackHref={`/${vertical}/dashboard`} />

        <h1 style={{
          fontSize: typography.sizes['2xl'],
          fontWeight: typography.weights.bold,
          color: colors.textPrimary,
          margin: `${spacing.sm} 0 ${spacing.md} 0`,
        }}>
          {t('dash.my_favorites', locale)}
        </h1>

        {vendorCards.length === 0 ? (
          <div style={{
            padding: spacing.xl,
            textAlign: 'center',
            backgroundColor: colors.surfaceElevated,
            borderRadius: radius.md,
            border: `1px solid ${colors.border}`,
          }}>
            <p style={{ fontSize: 40, margin: `0 0 ${spacing.sm} 0` }}>❤️</p>
            <p style={{
              fontSize: typography.sizes.base,
              color: colors.textSecondary,
              margin: `0 0 ${spacing.sm} 0`,
            }}>
              {t('favorites.empty', locale, { vendors: term(vertical, 'vendors', locale).toLowerCase() })}
            </p>
            <Link
              href={`/${vertical}/vendors`}
              style={{
                display: 'inline-block',
                padding: `${spacing.xs} ${spacing.md}`,
                backgroundColor: colors.primary,
                color: colors.textInverse,
                borderRadius: radius.sm,
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.sm,
                textDecoration: 'none',
              }}
            >
              {t('favorites.browse', locale, { vendors: term(vertical, 'vendors', locale) })}
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            {vendorCards.map(vendor => (
              <Link
                key={vendor.id}
                href={`/${vertical}/vendor/${vendor.id}/profile`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                  padding: spacing.sm,
                  backgroundColor: colors.surfaceElevated,
                  borderRadius: radius.md,
                  border: `1px solid ${colors.border}`,
                  textDecoration: 'none',
                  color: colors.textPrimary,
                  transition: 'box-shadow 0.15s',
                }}
              >
                {/* Vendor Logo */}
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: radius.md,
                  overflow: 'hidden',
                  flexShrink: 0,
                  backgroundColor: colors.surfaceMuted,
                }}>
                  {vendor.imageUrl ? (
                    <Image
                      src={vendor.imageUrl}
                      alt={vendor.name}
                      width={56}
                      height={56}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                      color: colors.textMuted,
                    }}>
                      {term(vertical, 'market_icon_emoji')}
                    </div>
                  )}
                </div>

                {/* Vendor Name + Rating */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: typography.sizes.base,
                    fontWeight: typography.weights.semibold,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {vendor.name}
                  </div>
                  {vendor.rating !== null && vendor.ratingCount !== null && vendor.ratingCount > 0 && (
                    <div style={{
                      fontSize: typography.sizes.xs,
                      color: colors.textMuted,
                      marginTop: 2,
                    }}>
                      {'★'} {vendor.rating?.toFixed(1)} ({vendor.ratingCount})
                    </div>
                  )}
                </div>

                {/* Arrow */}
                <span style={{ color: colors.textMuted, fontSize: 18 }}>›</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
