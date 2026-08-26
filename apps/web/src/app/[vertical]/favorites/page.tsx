export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { defaultBranding } from '@/lib/branding'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import { getLocale } from '@/lib/locale/server'
import { t } from '@/lib/locale/messages'
import BackLink from '@/components/shared/BackLink'
import { evaluateBuyerAchievements } from '@/lib/loyalty/evaluate'
import { BADGE_CATALOG, getLoyaltyThresholds } from '@/lib/loyalty/config'

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

  // Loyalty Layer 1 (owner 2026-08-25): badges live HERE, not on a new
  // dashboard tile — "we just cleaned up the dashboard, keep it consolidated".
  // Evaluating on page load is the lazy path: it self-heals and it is the
  // backfill for buyers who already have history. Never throws; pre-mig-236 it
  // renders progress only.
  const thresholds = getLoyaltyThresholds(vertical)
  const evaluation = await evaluateBuyerAchievements(createServiceClient(), user.id, vertical)

  // Names for vendor-scoped badges whose vendor isn't in the favorites list.
  const vendorNames = new Map<string, string>(vendorCards.map(v => [v.id, v.name]))
  const missingVendorIds = [...new Set(
    evaluation.earned.map(r => r.vendor_profile_id).filter((id): id is string => !!id && !vendorNames.has(id))
  )]
  if (missingVendorIds.length > 0) {
    const { data: extra } = await supabase
      .from('vendor_profiles')
      .select('id, profile_data')
      .in('id', missingVendorIds)
    for (const v of (extra || []) as Array<{ id: string; profile_data: Record<string, unknown> | null }>) {
      vendorNames.set(v.id, (v.profile_data?.business_name as string) || (v.profile_data?.farm_name as string) || 'Vendor')
    }
  }

  const earnedBadges = [...evaluation.earned]
    .sort((a, b) => (a.earned_at < b.earned_at ? 1 : -1))
    .map(row => {
      const def = BADGE_CATALOG[row.badge_key]
      return def ? {
        id: row.id,
        emoji: def.emoji,
        name: def.name(vertical),
        description: def.description(vertical, thresholds),
        vendorName: row.vendor_profile_id ? vendorNames.get(row.vendor_profile_id) : undefined,
        earnedAt: row.earned_at,
      } : null
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)

  // "Next up": the three closest unearned badges.
  const nextUp = evaluation.progress
    .filter(p => p.target > 0)
    .sort((a, b) => (b.current / b.target) - (a.current / a.target))
    .slice(0, 3)
    .map(p => {
      const def = BADGE_CATALOG[p.key]
      return {
        key: p.key,
        emoji: def.emoji,
        name: def.name(vertical),
        current: Math.min(p.current, p.target),
        target: p.target,
        vendorName: p.vendorProfileId ? vendorNames.get(p.vendorProfileId) : undefined,
      }
    })

  // Per-favorite standing chip: the highest vendor-scoped badge at that vendor.
  const vendorBadgeByVendor = new Map<string, string>()
  for (const row of evaluation.earned) {
    if (!row.vendor_profile_id) continue
    const def = BADGE_CATALOG[row.badge_key]
    if (!def) continue
    if (row.badge_key === 'local_legend' || !vendorBadgeByVendor.has(row.vendor_profile_id)) {
      vendorBadgeByVendor.set(row.vendor_profile_id, `${def.emoji} ${def.name(vertical)}`)
    }
  }

  const formatEarned = (iso: string) => new Date(iso).toLocaleDateString(locale === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric' })

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

        {/* My Badges — Loyalty Layer 1. Earned badges first, then the three
            closest "next up" targets so the page always shows a reason to
            come back. Copy comes from BADGE_CATALOG (one source for the badge,
            the notification, and this card). */}
        <section style={{
          padding: spacing.sm,
          marginBottom: spacing.md,
          backgroundColor: colors.surfaceElevated,
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
          boxShadow: shadows.sm,
        }}>
          <h2 style={{
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.semibold,
            color: colors.textPrimary,
            margin: `0 0 ${spacing.xs} 0`,
          }}>
            {t('rewards.title', locale)}
          </h2>

          {earnedBadges.length === 0 ? (
            <p style={{ margin: 0, fontSize: typography.sizes.sm, color: colors.textSecondary }}>
              {t('rewards.empty', locale)}
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
              {earnedBadges.map(badge => (
                <div
                  key={badge.id}
                  title={badge.description}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: `${spacing['2xs']} ${spacing.xs}`,
                    borderRadius: radius.sm,
                    backgroundColor: colors.surfaceMuted,
                    border: `1px solid ${colors.borderMuted}`,
                    fontSize: typography.sizes.sm,
                    color: colors.textPrimary,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{badge.emoji}</span>
                  <span>
                    <span style={{ fontWeight: typography.weights.semibold }}>{badge.name}</span>
                    {badge.vendorName && (
                      <span style={{ color: colors.textMuted }}> {t('rewards.at_vendor', locale, { vendor: badge.vendorName })}</span>
                    )}
                    <span style={{ display: 'block', fontSize: typography.sizes.xs, color: colors.textMuted }}>
                      {t('rewards.earned_on', locale, { date: formatEarned(badge.earnedAt) })}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {nextUp.length > 0 && (
            <div style={{ marginTop: spacing.sm }}>
              <p style={{
                margin: `0 0 ${spacing['2xs']} 0`,
                fontSize: typography.sizes.xs,
                fontWeight: typography.weights.semibold,
                color: colors.textMuted,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                {t('rewards.progress_title', locale)}
              </p>
              {nextUp.map(p => (
                <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: 4 }}>
                  <span style={{ fontSize: 16, width: 22, textAlign: 'center' }}>{p.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: typography.sizes.sm, color: colors.textPrimary }}>
                      {p.name}
                      {p.vendorName && (
                        <span style={{ color: colors.textMuted }}> {t('rewards.at_vendor', locale, { vendor: p.vendorName })}</span>
                      )}
                    </div>
                    <div style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, overflow: 'hidden', marginTop: 2 }}>
                      <div style={{ width: `${Math.round((p.current / p.target) * 100)}%`, height: '100%', backgroundColor: colors.primary }} />
                    </div>
                  </div>
                  <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted, whiteSpace: 'nowrap' }}>
                    {t('rewards.progress_line', locale, { current: String(p.current), target: String(p.target) })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

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
                  {vendorBadgeByVendor.has(vendor.id) && (
                    <div style={{ fontSize: typography.sizes.xs, color: colors.primary, marginTop: 2, fontWeight: typography.weights.semibold }}>
                      {vendorBadgeByVendor.get(vendor.id)}
                    </div>
                  )}
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
