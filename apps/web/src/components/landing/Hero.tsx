'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { UtensilsCrossed, Truck, MapPin as MapPinIcon } from 'lucide-react'
import { spacing, typography, radius, containers, getVerticalColors } from '@/lib/design-tokens'
import { term, getContent } from '@/lib/vertical'
import { t } from '@/lib/locale/messages'
import { LocationEntry } from './LocationEntry'

// FM landing page watermelon palette (not in design-tokens — landing-only)
const FM_WATERMELON = '#FF6B6B'

interface HeroProps {
  vertical: string
  initialCity?: string | null
  stats?: {
    listingCount: number
    vendorCount: number
    marketCount: number
  }
  locale?: string
}

export function Hero({ vertical, initialCity, stats, locale }: HeroProps) {
  const colors = getVerticalColors(vertical)
  const { hero, trust_stats } = getContent(vertical, locale)
  const [userZipCode, setUserZipCode] = useState<string | null>(null)
  const isFT = vertical === 'food_trucks'
  const isFM = vertical === 'farmers_market'

  // Build URLs with location if available
  const browseUrl = userZipCode
    ? `/${vertical}/browse?zip=${userZipCode}`
    : `/${vertical}/browse`

  const marketsUrl = userZipCode
    ? `/${vertical}/markets?zip=${userZipCode}`
    : `/${vertical}/markets`

  const vendorsUrl = userZipCode
    ? `/${vertical}/vendors?zip=${userZipCode}`
    : `/${vertical}/vendors`

  // FT stats for inline rendering — always show all 3 (Menu Items, Food Trucks, Locations)
  const hasStats = !!stats
  const ftStatItems = stats ? [
    { icon: UtensilsCrossed, value: stats.listingCount, label: trust_stats.products_label },
    { icon: Truck, value: stats.vendorCount, label: trust_stats.vendors_label },
    { icon: MapPinIcon, value: stats.marketCount, label: trust_stats.markets_label },
  ] : []

  // FM: Watermelon hero — logo on watermelon bg, then white section with headline + zip + description
  if (isFM) {
    return (
      <section>
        {/* Watermelon top section with centered logo */}
        <div
          className="flex justify-center"
          style={{
            backgroundColor: FM_WATERMELON,
            paddingTop: 'clamp(80px, 12vh, 120px)',
            paddingBottom: spacing['2xl'],
          }}
        >
          <Image
            src="/logos/farmersmarketing-full-logo.png"
            alt="Farmers Marketing"
            width={220}
            height={220}
            sizes="220px"
            style={{ margin: '0 auto' }}
            priority
          />
        </div>

        {/* White section with headline, zip search, description */}
        <div
          className="flex justify-center"
          style={{
            backgroundColor: '#ffffff',
            paddingTop: spacing.xl,
            paddingBottom: spacing.xl,
          }}
        >
          <div
            className="w-full text-center"
            style={{
              maxWidth: containers.lg,
              paddingLeft: 'clamp(20px, 5vw, 60px)',
              paddingRight: 'clamp(20px, 5vw, 60px)',
            }}
          >
            <div style={{ maxWidth: '600px', margin: '0 auto' }}>
              {/* Headline */}
              <h1
                style={{
                  fontSize: typography.sizes['3xl'],
                  fontWeight: typography.weights.bold,
                  lineHeight: typography.leading.tight,
                  color: '#1a1a1a',
                  marginBottom: spacing.md,
                }}
              >
                {hero.headline_line1}{' '}
                {hero.headline_line2}
              </h1>

              {/* Zip search prompt */}
              <p
                style={{
                  fontSize: typography.sizes.sm,
                  color: '#4b5563',
                  marginBottom: spacing.sm,
                }}
              >
                Enter your zip code and find local vendors near you
              </p>

              {/* Location Entry */}
              <LocationEntry
                vertical={vertical}
                initialCity={initialCity}
                onLocationSet={setUserZipCode}
                locale={locale}
              />

              {/* Description */}
              <p
                style={{
                  fontSize: typography.sizes.base,
                  lineHeight: typography.leading.relaxed,
                  color: '#4b5563',
                  maxWidth: '540px',
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  marginTop: spacing.sm,
                }}
              >
                {hero.subtitle}
              </p>
            </div>
          </div>
        </div>
      </section>
    )
  }

  // FT + other verticals: existing layout
  return (
    <section
      className="relative flex items-center justify-center"
      style={{
        minHeight: isFT ? 'auto' : '650px',
        background: isFT
          ? colors.surfaceElevated
          : `linear-gradient(180deg, ${colors.surfaceSubtle} 0%, ${colors.surfaceBase} 100%)`,
        paddingTop: isFT ? spacing.lg : 'clamp(100px, 15vh, 140px)',
        paddingBottom: isFT ? 0 : spacing['2xl'],
        overflow: isFT ? 'hidden' : undefined,
      }}
    >
      <div
        className="w-full mx-auto"
        style={{
          maxWidth: containers.lg,
          paddingLeft: 'clamp(20px, 5vw, 60px)',
          paddingRight: 'clamp(20px, 5vw, 60px)',
        }}
      >
        <div
          className="mx-auto text-center"
          style={{ maxWidth: '650px' }}
        >
          {/* FT: Large centered logo */}
          {isFT && (
            <>
              <div style={{ margin: `${spacing.lg} 0` }}>
                <Image
                  src="/logos/food-truckn-logo.png"
                  alt="Food Truck'n"
                  width={260}
                  height={260}
                  sizes="260px"
                  style={{ margin: '0 auto' }}
                  priority
                />
              </div>
            </>
          )}

          {/* Headline */}
          <h1
            style={{
              fontSize: typography.sizes['4xl'],
              fontWeight: typography.weights.bold,
              lineHeight: typography.leading.tight,
              color: colors.textPrimary,
              marginBottom: spacing.sm,
              letterSpacing: '-0.02em',
            }}
          >
            <>
              {hero.headline_line1}
              <br />
              <span style={{
                color: colors.primaryDark,
              }}>
                {hero.headline_line2}
              </span>
            </>
          </h1>

          {/* Location Entry */}
          <LocationEntry
            vertical={vertical}
            initialCity={initialCity}
            onLocationSet={setUserZipCode}
            locale={locale}
          />

          {/* Subheadline */}
          <p
            style={{
              fontSize: typography.sizes.lg,
              lineHeight: typography.leading.relaxed,
              color: colors.textSecondary,
              marginBottom: isFT ? 0 : spacing.lg,
              maxWidth: '540px',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            {hero.subtitle}
          </p>
        </div>

        {/* FT: Inline stats bar — full-width grey bar between subtitle and CTA buttons */}
        {isFT && hasStats && (
          <div
            style={{
              backgroundColor: '#6b6b6b',
              padding: `${spacing.lg} ${spacing.md}`,
              marginTop: spacing.md,
              marginBottom: spacing.md,
              marginLeft: 'calc(-50vw + 50%)',
              marginRight: 'calc(-50vw + 50%)',
              width: '100vw',
            }}
          >
            {/* Header text */}
            <p
              className="text-center"
              style={{
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                color: '#ffffff',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: spacing.md,
              }}
            >
              {t('hero.ft_stats_banner', locale)}
            </p>

            {/* Stats grid */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: spacing.xl,
              }}
            >
              {ftStatItems.map((stat, index) => {
                const Icon = stat.icon
                return (
                  <div key={index} className="text-center">
                    <div
                      className="inline-flex items-center justify-center rounded-full"
                      style={{
                        width: 56,
                        height: 56,
                        backgroundColor: colors.primary,
                        marginBottom: spacing.xs,
                      }}
                    >
                      <Icon style={{
                        width: 28,
                        height: 28,
                        color: '#ffffff',
                      }} />
                    </div>
                    <div
                      style={{
                        fontSize: typography.sizes['3xl'],
                        fontWeight: typography.weights.bold,
                        color: '#ffffff',
                        lineHeight: 1,
                        marginBottom: spacing['3xs'],
                      }}
                    >
                      {stat.value.toLocaleString()}+
                    </div>
                    <div
                      style={{
                        fontSize: typography.sizes.xs,
                        color: 'rgba(255,255,255,0.9)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        fontWeight: typography.weights.medium,
                      }}
                    >
                      {stat.label}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div
          className="mx-auto text-center"
          style={{ maxWidth: '650px' }}
        >
          {/* CTAs — FT: filled red pills, uppercase */}
          {isFT && (
            <div
              className="flex flex-col sm:flex-row justify-center items-center"
              style={{
                gap: spacing.xs,
                marginTop: spacing['2xl'],
                marginBottom: spacing['2xl'],
              }}
            >
              {[
                { label: term(vertical, 'browse_products_cta', locale), href: browseUrl },
                { label: term(vertical, 'find_vendors_cta', locale), href: vendorsUrl },
                { label: term(vertical, 'find_markets_cta', locale), href: marketsUrl },
              ].map((cta) => (
                <Link
                  key={cta.label}
                  href={cta.href}
                  className="inline-flex items-center justify-center transition-all"
                  style={{
                    backgroundColor: colors.primary,
                    color: '#ffffff',
                    padding: `${spacing.sm} ${spacing.lg}`,
                    borderRadius: radius.full,
                    fontSize: typography.sizes.base,
                    fontWeight: typography.weights.semibold,
                    minWidth: '220px',
                    border: 'none',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = colors.primaryDark
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = colors.primary
                  }}
                >
                  {cta.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* FT: Lifestyle photo — edge-to-edge */}
        {isFT && (
          <div style={{
            marginTop: spacing.md,
            marginLeft: 'calc(-50vw + 50%)',
            marginRight: 'calc(-50vw + 50%)',
            width: '100vw',
          }}>
            <Image
              src="/images/food-truck-lifestyle.jpg"
              alt="Customer ordering at a food truck"
              width={1200}
              height={600}
              sizes="100vw"
              style={{
                width: '100%',
                height: 'auto',
                objectFit: 'cover',
                display: 'block',
              }}
              priority
            />
          </div>
        )}
      </div>
    </section>
  )
}
