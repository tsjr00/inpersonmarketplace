'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'
import { defaultBranding } from '@/lib/branding/defaults'
import { organizationJsonLd, breadcrumbJsonLd } from '@/lib/marketing/json-ld'

export default function AboutPage() {
  const { vertical } = useParams<{ vertical: string }>()
  const locale = getClientLocale()
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const baseUrl = `https://${branding.domain}`

  const isFT = vertical === 'food_trucks'
  const texasCities = ['Dallas', 'Fort Worth', 'Houston', 'Austin', 'San Antonio', 'El Paso']
  const orgSchema = organizationJsonLd({
    name: branding.brand_name,
    url: baseUrl,
    description: isFT
      ? 'Mobile food ordering platform connecting customers with local food trucks. Pre-order tacos, BBQ, pizza, burgers, and more — skip the line and pick up hot and ready.'
      : 'Online ordering platform connecting shoppers with local farmers market vendors and cottage food producers. Pre-order fresh produce, baked goods, honey, jams, and artisan products for market pickup.',
    areaServed: texasCities.map(city => `${city}, Texas`),
  })

  const breadcrumbs = breadcrumbJsonLd([
    { name: 'Home', url: `${baseUrl}/${vertical}` },
    { name: 'About Us', url: `${baseUrl}/${vertical}/about` },
  ])

  // Handle scroll to hash on page load
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const id = window.location.hash.slice(1)
      const element = document.getElementById(id)
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' })
        }, 100)
      }
    }
  }, [])

  return (
    <main style={{ maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
      <h1 style={{ fontSize: typography.sizes['3xl'], fontWeight: typography.weights.bold, marginBottom: spacing.lg, color: colors.textPrimary }}>
        {t('about.title', locale, { brand: branding.brand_name })}
      </h1>

      <div style={{ color: colors.textSecondary, fontSize: typography.sizes.base, lineHeight: typography.leading.relaxed }}>
        {/* Mission Section */}
        <section style={{ marginBottom: spacing.xl }}>
          <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, marginBottom: spacing.md, color: colors.textPrimary }}>
            {t('about.our_mission', locale)}
          </h2>
          <p style={{ marginBottom: spacing.md }}>
            {t('about.mission_p1', locale, {
              vendor_people: term(vertical, 'vendor_people', locale),
              brand: branding.brand_name,
              vendors: term(vertical, 'vendors', locale).toLowerCase(),
            })}
          </p>
          <p style={{ marginBottom: spacing.md }}>
            {t('about.mission_p2', locale, {
              brand: term(vertical, 'display_name', locale),
              vendors: term(vertical, 'vendors', locale).toLowerCase(),
              product_examples: term(vertical, 'product_examples', locale),
            })}
          </p>
          {!isFT && (
            <p style={{ marginBottom: spacing.md }}>
              {t('about.mission_p3_fm', locale)}
            </p>
          )}
        </section>

        {/* How It Works Section */}
        <section style={{ marginBottom: spacing.xl }}>
          <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, marginBottom: spacing.md, color: colors.textPrimary }}>
            {t('about.what_we_do', locale)}
          </h2>
          <p style={{ marginBottom: spacing.md }}>
            {t('about.what_we_do_intro', locale, {
              vendors: term(vertical, 'vendors', locale).toLowerCase(),
              markets: term(vertical, 'markets', locale).toLowerCase(),
            })}
          </p>
          <ul style={{ marginBottom: spacing.md, paddingLeft: spacing.lg }}>
            <li style={{ marginBottom: spacing.xs }}>{t('about.li_find', locale, { vendors: term(vertical, 'vendors', locale).toLowerCase(), markets: term(vertical, 'markets', locale).toLowerCase() })}</li>
            <li style={{ marginBottom: spacing.xs }}>{t('about.li_preorder', locale, { products: term(vertical, 'products', locale).toLowerCase() })}</li>
            <li style={{ marginBottom: spacing.xs }}>{t('about.li_pickup', locale, { market: term(vertical, 'market', locale).toLowerCase() })}</li>
            <li style={{ marginBottom: spacing.xs }}>{t('about.li_subscribe', locale, { market_boxes: term(vertical, 'market_boxes', locale) })}</li>
            <li style={{ marginBottom: spacing.xs }}>{t('about.li_support', locale, { vendors: term(vertical, 'vendors', locale).toLowerCase() })}</li>
          </ul>
        </section>

        {/* For Vendors Section */}
        <section id="vendor-faq" style={{ marginBottom: spacing.xl }}>
          <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, marginBottom: spacing.md, color: colors.textPrimary }}>
            {t('footer.for_vendors', locale)}
          </h2>
          <p style={{ marginBottom: spacing.md }}>
            {t('about.for_vendors_intro', locale, {
              vendors: term(vertical, 'vendors', locale).toLowerCase(),
              market_day: term(vertical, 'market_day', locale).toLowerCase(),
            })}
          </p>
          <ul style={{ marginBottom: spacing.md, paddingLeft: spacing.lg }}>
            <li style={{ marginBottom: spacing.xs }}>{t('about.li_presell', locale, { products: term(vertical, 'products', locale).toLowerCase() })}</li>
            <li style={{ marginBottom: spacing.xs }}>{t('about.li_accept_cards', locale)}</li>
            <li style={{ marginBottom: spacing.xs }}>{t('about.li_build_following', locale)}</li>
            <li style={{ marginBottom: spacing.xs }}>{t('about.li_get_discovered', locale)}</li>
          </ul>
          <p style={{ marginBottom: spacing.md }}>
            {t('about.vendor_cta', locale, { vendor: term(vertical, 'vendor', locale).toLowerCase() })}{' '}
            <Link href={`/${vertical}/vendor-signup`} style={{ color: colors.primary }}>
              {t('about.sign_up_here', locale)}
            </Link>
            {' '}{t('about.to_get_started', locale)}
          </p>
        </section>

        {/* Contact Section */}
        <section id="contact" style={{ marginBottom: spacing.xl, paddingTop: spacing.lg }}>
          <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, marginBottom: spacing.md, color: colors.textPrimary }}>
            {t('about.contact_us', locale)}
          </h2>
          <p style={{ marginBottom: spacing.lg }}>
            {t('about.contact_intro', locale)}
          </p>

          <div style={{
            backgroundColor: colors.surfaceSubtle,
            padding: spacing.lg,
            borderRadius: radius.lg,
            border: `1px solid ${colors.border}`
          }}>
            <div style={{ marginBottom: spacing.md }}>
              <p style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.medium, color: colors.textPrimary, marginBottom: spacing.xs }}>
                {t('about.submit_support', locale)}
              </p>
              <Link
                href={`/${vertical}/support`}
                style={{ fontSize: typography.sizes.lg, color: colors.primary, textDecoration: 'none' }}
              >
                {t('about.contact_support', locale)}
              </Link>
            </div>

            <div>
              <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>
                {t('about.response_time', locale)}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
