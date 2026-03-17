'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'
import { defaultBranding } from '@/lib/branding/defaults'
import { howToJsonLd, breadcrumbJsonLd } from '@/lib/marketing/json-ld'

export default function HowItWorksPage() {
  const params = useParams()
  const vertical = params.vertical as string
  const locale = getClientLocale()
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const isFT = vertical === 'food_trucks'
  const baseUrl = `https://${branding.domain}`

  const buyerHowTo = howToJsonLd({
    name: isFT
      ? 'How to Order from Food Trucks Online'
      : 'How to Order from Farmers Markets Online',
    description: isFT
      ? 'Pre-order from local food trucks, skip the line, and pick up your food hot and ready.'
      : 'Pre-order fresh produce and local goods from farmers market vendors and pick up at the market.',
    steps: isFT ? [
      { name: 'Find Food Trucks Near You', text: 'Browse food trucks in your area and explore their menus online.' },
      { name: 'Add Dishes to Your Cart', text: 'Select your favorite menu items and add them to your cart.' },
      { name: 'Complete Checkout', text: 'Pay securely online. Your order is confirmed instantly.' },
      { name: 'Skip the Line at Pickup', text: 'Head to the truck — your food is hot and ready when you arrive. No waiting in line.' },
    ] : [
      { name: 'Browse Local Farmers Markets', text: 'Find farmers markets and vendors near you. Browse fresh produce, baked goods, and artisan products.' },
      { name: 'Pre-Order Online', text: 'Add items to your cart and complete your order with secure checkout.' },
      { name: 'Pick Up at the Market', text: 'Visit the market on pickup day. Your pre-ordered items are reserved and waiting.' },
      { name: 'Enjoy Fresh, Local Food', text: 'Take your time browsing other vendors and enjoy being part of your local community.' },
    ],
  })

  const breadcrumbs = breadcrumbJsonLd([
    { name: 'Home', url: `${baseUrl}/${vertical}` },
    { name: 'How It Works', url: `${baseUrl}/${vertical}/how-it-works` },
  ])

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
    }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buyerHowTo) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${colors.primaryDark || '#689F38'} 0%, ${colors.primary} 100%)`,
        color: 'white',
        padding: `${spacing['2xl']} ${spacing.md}`,
        textAlign: 'center',
      }}>
        <Image
          src={branding.logo_path}
          alt={branding.brand_name}
          width={64}
          height={64}
          sizes="64px"
          style={{ marginBottom: spacing.sm, borderRadius: radius.full, background: 'white', padding: '6px' }}
        />
        <h1 style={{
          fontSize: typography.sizes['3xl'],
          fontWeight: typography.weights.bold,
          margin: `0 0 ${spacing.xs} 0`,
        }}>
          {isFT ? t('hiw.hero_title_ft', locale) : t('hiw.hero_title_fm', locale)}
        </h1>
        <p style={{
          fontSize: typography.sizes.lg,
          opacity: 0.9,
          margin: 0,
          maxWidth: '600px',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          {isFT
            ? t('hiw.hero_subtitle_ft', locale)
            : t('hiw.hero_subtitle_fm', locale)}
        </p>
      </div>

      <div style={{ maxWidth: containers.lg, margin: '0 auto', padding: `${spacing.lg} ${spacing.md}` }}>

        {/* Quick Links */}
        <div style={{
          display: 'flex',
          gap: spacing.sm,
          marginBottom: spacing.lg,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}>
          <a href="#buyers" style={linkChipStyle}>{t('hiw.chip_buyers', locale)}</a>
          <a href="#vendors" style={linkChipStyle}>{t('hiw.chip_vendors', locale)}</a>
          <a href="#pickup" style={linkChipStyle}>{t('hiw.chip_pickup', locale)}</a>
          <a href="#cancellations" style={linkChipStyle}>{t('hiw.chip_cancellations', locale)}</a>
        </div>

        {/* === FOR BUYERS === */}
        <section id="buyers" style={{ marginBottom: spacing.xl }}>
          <SectionHeader title={t('hiw.buyers_title', locale)} subtitle={t('hiw.buyers_subtitle', locale)} accent={colors.primary} />

          <StepList steps={[
            t('hiw.b_step1', locale, { products: term(vertical, 'products', locale).toLowerCase(), vendors: term(vertical, 'vendors', locale).toLowerCase() }),
            t('hiw.b_step2', locale),
            t('hiw.b_step3', locale),
            t('hiw.b_step4', locale),
            t('hiw.b_step5', locale),
            t('hiw.b_step6', locale),
            t('hiw.b_step7', locale, { vendor: term(vertical, 'vendor', locale).toLowerCase() }),
            t('hiw.b_step8', locale, { vendor: term(vertical, 'vendor', locale) }),
            t('hiw.b_step9', locale),
            t('hiw.b_step10', locale, { vendor: term(vertical, 'vendor', locale).toLowerCase() }),
          ]} />

          <InfoCard title={t('hiw.pickup_confirm_title', locale)} variant="green">
            <p>{t('hiw.pickup_confirm_intro', locale)}</p>
            <ol style={{ paddingLeft: '1.2rem', margin: `${spacing.xs} 0` }}>
              <li>{t('hiw.pickup_confirm_li1', locale)}</li>
              <li>{t('hiw.pickup_confirm_li2', locale)}</li>
              <li>{t('hiw.pickup_confirm_li3', locale)}</li>
            </ol>
            <p style={{ fontWeight: typography.weights.semibold, margin: `${spacing.xs} 0 0 0` }}>
              {t('hiw.pickup_confirm_note', locale)}
            </p>
          </InfoCard>

          <InfoCard title={t('hiw.something_wrong', locale)} variant="amber">
            <ul style={{ paddingLeft: '1.2rem', margin: `${spacing.xs} 0` }}>
              <li><strong>{t('hiw.wrong_missing', locale)}</strong> {t('hiw.wrong_missing_action', locale)}</li>
              <li><strong>{t('hiw.wrong_items', locale)}</strong> {t('hiw.wrong_items_action', locale)}</li>
              <li><strong>{t('hiw.wrong_no_vendor', locale)}</strong> {t('hiw.wrong_no_vendor_action', locale)}</li>
            </ul>
          </InfoCard>
        </section>

        {/* === FOR VENDORS === */}
        <section id="vendors" style={{ marginBottom: spacing.xl }}>
          <SectionHeader title={t('hiw.vendors_title', locale)} subtitle={t('hiw.vendors_subtitle', locale)} accent={colors.primaryDark || '#689F38'} />

          <StepList steps={[
            t('hiw.v_step1', locale),
            t('hiw.v_step2', locale),
            t('hiw.v_step3', locale, { market_day: term(vertical, 'market_day', locale).toLowerCase() }),
            t('hiw.v_step4', locale),
            t('hiw.v_step5', locale),
            t('hiw.v_step6', locale, { market_day: term(vertical, 'market_day', locale).toLowerCase() }),
            t('hiw.v_step7', locale),
            t('hiw.v_step8', locale),
            t('hiw.v_step9', locale),
            t('hiw.v_step10', locale),
          ]} />

          <InfoCard title={t('hiw.why_confirm', locale)} variant="green">
            <ul style={{ paddingLeft: '1.2rem', margin: `${spacing.xs} 0` }}>
              <li>{t('hiw.why_confirm_li1', locale)}</li>
              <li>{t('hiw.why_confirm_li2', locale)}</li>
              <li>{t('hiw.why_confirm_li3', locale)}</li>
              <li>{t('hiw.why_confirm_li4', locale)}</li>
            </ul>
          </InfoCard>

          <InfoCard title={t('hiw.best_practices', locale)} variant="blue">
            <ul style={{ paddingLeft: '1.2rem', margin: `${spacing.xs} 0` }}>
              <li>{t('hiw.bp_li1', locale, { market_hours: term(vertical, 'market_hours', locale).toLowerCase() })}</li>
              <li>{t('hiw.bp_li2', locale)}</li>
              <li>{t('hiw.bp_li3', locale)}</li>
              <li>{t('hiw.bp_li4', locale)}</li>
              <li>{t('hiw.bp_li5', locale)}</li>
            </ul>
          </InfoCard>

          <InfoCard title={t('hiw.payment_timing', locale)} variant="default">
            <ul style={{ paddingLeft: '1.2rem', margin: `${spacing.xs} 0` }}>
              <li>{t('hiw.pt_li1', locale)}</li>
              <li>{t('hiw.pt_li2', locale)}{' '}
                <a
                  href="https://dashboard.stripe.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: colors.primary, fontWeight: typography.weights.semibold }}
                >
                  {t('hiw.pt_li2_link', locale)}
                </a>
              </li>
              <li>{t('hiw.pt_li3', locale)}</li>
            </ul>
          </InfoCard>
        </section>

        {/* === PICKUP GUIDE === */}
        <section id="pickup" style={{ marginBottom: spacing.xl }}>
          <SectionHeader title={t('hiw.pickup_guide_title', locale)} subtitle={t('hiw.pickup_guide_subtitle', locale)} accent={colors.accent} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: spacing.md }}>
            <div style={cardStyle}>
              <h3 style={{ margin: `0 0 ${spacing.sm} 0`, color: colors.primary, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                {t('hiw.buyers_col', locale)}
              </h3>
              <PickupStepList color={colors.primary} steps={[
                t('hiw.bp1', locale),
                t('hiw.bp2', locale),
                t('hiw.bp3', locale),
                t('hiw.bp4', locale),
                t('hiw.bp5', locale),
                t('hiw.bp6', locale),
                t('hiw.bp7', locale),
              ]} />
            </div>

            <div style={cardStyle}>
              <h3 style={{ margin: `0 0 ${spacing.sm} 0`, color: colors.primaryDark || '#689F38', fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                {t('hiw.vendors_col', locale)}
              </h3>
              <PickupStepList color={colors.primaryDark || '#689F38'} steps={[
                t('hiw.vp1', locale),
                t('hiw.vp2', locale),
                t('hiw.vp3', locale),
                t('hiw.vp4', locale),
                t('hiw.vp5', locale),
                t('hiw.vp6', locale),
                t('hiw.vp7', locale),
              ]} />
            </div>
          </div>
        </section>

        {/* === CANCELLATIONS === */}
        <section id="cancellations" style={{ marginBottom: spacing.xl }}>
          <SectionHeader title={t('hiw.cancel_title', locale)} subtitle={t('hiw.cancel_subtitle', locale)} accent={colors.accent} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: spacing.md }}>
            <InfoCard title={t('hiw.before_confirm', locale)} variant="green">
              <p style={{ margin: `${spacing.xs} 0`, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                {t('hiw.free_cancel', locale)}
              </p>
              <p style={{ margin: 0 }}>
                {t('hiw.free_cancel_desc', locale)}
              </p>
            </InfoCard>

            <InfoCard title={t('hiw.after_confirm', locale)} variant="amber">
              <p style={{ margin: `${spacing.xs} 0`, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                {t('hiw.fee_cancel', locale)}
              </p>
              <p style={{ margin: 0 }}>
                {t('hiw.fee_cancel_desc', locale)}
              </p>
            </InfoCard>
          </div>

          <p style={{
            marginTop: spacing.md,
            fontSize: typography.sizes.sm,
            color: colors.textMuted,
            textAlign: 'center',
          }}>
            {t('hiw.cancel_note', locale)}
          </p>
        </section>

        {/* CTA */}
        <div style={{
          textAlign: 'center',
          padding: `${spacing.lg} 0`,
          borderTop: `1px solid ${colors.border}`,
        }}>
          <p style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
            {t('hiw.ready_to_start', locale)}
          </p>
          <Link
            href={`/${vertical}/browse`}
            style={{
              display: 'inline-block',
              padding: `${spacing.sm} ${spacing.lg}`,
              backgroundColor: 'transparent',
              color: colors.primary,
              textDecoration: 'none',
              borderRadius: radius.md,
              fontWeight: typography.weights.bold,
              fontSize: typography.sizes.lg,
              border: `2px solid ${colors.primary}`,
            }}
          >
            {term(vertical, 'browse_products_cta', locale)}
          </Link>
        </div>
      </div>
    </div>
  )
}

// === Reusable Sub-Components ===

function SectionHeader({ title, subtitle, accent }: { title: string; subtitle: string; accent?: string }) {
  return (
    <div style={{ marginBottom: spacing.md }}>
      <div style={{
        width: '40px',
        height: '4px',
        backgroundColor: accent || colors.primary,
        borderRadius: radius.full,
        marginBottom: spacing.xs,
      }} />
      <h2 style={{
        fontSize: typography.sizes['2xl'],
        fontWeight: typography.weights.bold,
        color: colors.textPrimary,
        margin: `0 0 ${spacing['3xs']} 0`,
      }}>
        {title}
      </h2>
      <p style={{
        fontSize: typography.sizes.base,
        color: colors.textMuted,
        margin: 0,
      }}>
        {subtitle}
      </p>
    </div>
  )
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <div style={{
      marginBottom: spacing.md,
    }}>
      <ol style={{
        paddingLeft: '0',
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.xs,
        listStyle: 'none',
        counterReset: 'step-counter',
      }}>
        {steps.map((step, i) => (
          <li key={i} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: spacing.sm,
            fontSize: typography.sizes.base,
            lineHeight: typography.leading.relaxed,
            color: colors.textSecondary,
          }}>
            <span style={{
              flexShrink: 0,
              width: '28px',
              height: '28px',
              borderRadius: radius.full,
              backgroundColor: colors.primary,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.bold,
              marginTop: '2px',
            }}>
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function InfoCard({ title, variant, children }: {
  title: string
  variant: 'green' | 'amber' | 'blue' | 'default'
  children: React.ReactNode
}) {
  const variantStyles = {
    green: { accent: colors.primary, titleColor: colors.textPrimary },
    amber: { accent: colors.accent, titleColor: colors.textPrimary },
    blue: { accent: colors.primaryDark || '#689F38', titleColor: colors.textPrimary },
    default: { accent: colors.border, titleColor: colors.textPrimary },
  }
  const s = variantStyles[variant]

  return (
    <div style={{
      padding: spacing.md,
      borderLeft: `4px solid ${s.accent}`,
      borderRadius: `0 ${radius.md} ${radius.md} 0`,
      marginBottom: spacing.sm,
      backgroundColor: colors.surfaceElevated,
    }}>
      <h3 style={{
        margin: `0 0 ${spacing.xs} 0`,
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.bold,
        color: s.titleColor,
      }}>
        {title}
      </h3>
      <div style={{ fontSize: typography.sizes.base, color: colors.textSecondary, lineHeight: typography.leading.relaxed }}>
        {children}
      </div>
    </div>
  )
}

function PickupStepList({ steps, color }: { steps: string[]; color: string }) {
  return (
    <ol style={{ paddingLeft: 0, margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
      {steps.map((step, i) => (
        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.xs, fontSize: typography.sizes.sm, lineHeight: typography.leading.relaxed, color: colors.textSecondary }}>
          <span style={{
            flexShrink: 0,
            width: '22px',
            height: '22px',
            borderRadius: radius.full,
            backgroundColor: color,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: typography.sizes.xs,
            fontWeight: typography.weights.bold,
            marginTop: '2px',
          }}>
            {i + 1}
          </span>
          <span style={{ fontWeight: i === steps.length - 1 ? typography.weights.bold : undefined }}>{step}</span>
        </li>
      ))}
    </ol>
  )
}

const linkChipStyle: React.CSSProperties = {
  padding: `${spacing['2xs']} ${spacing.sm}`,
  backgroundColor: colors.surfaceElevated,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.full,
  color: colors.primary,
  textDecoration: 'none',
  fontSize: typography.sizes.sm,
  fontWeight: typography.weights.semibold,
}

const cardStyle: React.CSSProperties = {
  padding: spacing.md,
  backgroundColor: colors.surfaceElevated,
  borderRadius: radius.md,
  borderTop: `3px solid ${colors.primary}`,
}
