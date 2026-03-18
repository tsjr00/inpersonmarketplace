import { Metadata } from 'next'
import Link from 'next/link'
import { EventRequestForm } from '@/components/events/EventRequestForm'
import { statusColors, spacing, typography, radius } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'
import { defaultBranding } from '@/lib/branding'
import { getLocale } from '@/lib/locale/server'
import { t } from '@/lib/locale/messages'

interface CateringPageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{ vendor?: string }>
}

export async function generateMetadata({ params }: CateringPageProps): Promise<Metadata> {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const isFT = vertical === 'food_trucks'

  return {
    title: isFT
      ? `Book Food Trucks for Your Event | ${branding.brand_name}`
      : `Book a Pop-Up Market | ${branding.brand_name}`,
    description: isFT
      ? 'Bring food trucks to your corporate event, office lunch, or celebration. We match event-approved trucks to your needs — tacos, BBQ, Asian fusion, pizza, and more. Pre-orders, professional service, hassle-free.'
      : 'Host a pop-up farmers market at your venue. Fresh local produce, artisan goods, and cottage foods — curated for your event.',
    keywords: isFT
      ? 'food truck catering, corporate food truck event, book food trucks, office lunch catering, food truck rental, private event catering'
      : 'pop-up market, farmers market event, local food event, artisan market booking',
    openGraph: {
      title: isFT ? 'Book Food Trucks for Your Event' : 'Book a Pop-Up Market',
      description: isFT
        ? 'Professional food truck catering for corporate events, office lunches, and celebrations. We handle the planning — you enjoy the food.'
        : 'Curated pop-up farmers market for your venue or event.',
      type: 'website',
    },
  }
}

export default async function CateringPage({ params, searchParams }: CateringPageProps) {
  const { vertical } = await params
  const { vendor: vendorPreference } = await searchParams
  const locale = await getLocale()
  const isFT = vertical === 'food_trucks'

  const accent = isFT ? '#ff5757' : '#2d5016'

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px' }}>
      {/* Back link */}
      <div style={{ marginBottom: spacing.lg }}>
        <Link
          href={`/${vertical}`}
          style={{
            color: statusColors.neutral500,
            textDecoration: 'none',
            fontSize: typography.sizes.sm,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {t('events.back', locale)}
        </Link>
      </div>

      {/* Hero section */}
      <div style={{ marginBottom: spacing.lg, textAlign: 'center' }}>
        <h1
          style={{
            color: accent,
            marginBottom: spacing['2xs'],
            marginTop: 0,
            fontSize: typography.sizes['2xl'],
          }}
        >
          {term(vertical, 'event_feature_name', locale)}
        </h1>
        <p
          style={{
            color: statusColors.neutral600,
            margin: 0,
            fontSize: typography.sizes.base,
            lineHeight: 1.6,
            maxWidth: 480,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {term(vertical, 'event_hero_subtitle', locale)}
        </p>
        {isFT && (
          <p style={{
            marginTop: 12,
            fontSize: 13,
            color: '#6b7280',
            fontStyle: 'italic',
          }}>
            Trusted by local businesses for corporate lunches, team celebrations, and company events
          </p>
        )}
      </div>

      {/* Cuisine showcase — shows breadth without exposing specific vendors */}
      {isFT && (
        <div style={{
          marginBottom: spacing.lg,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 8,
        }}>
          {[
            '🌮 Tacos & Mexican',
            '🍖 BBQ & Smokehouse',
            '🍕 Pizza',
            '🍔 Burgers & Sliders',
            '🥡 Asian Fusion',
            '🍗 Southern & Soul Food',
            '🥙 Mediterranean',
            '🌯 Tex-Mex',
            '🧁 Desserts & Sweets',
            '☕ Coffee & Beverages',
          ].map(cuisine => (
            <span key={cuisine} style={{
              padding: '6px 14px',
              backgroundColor: '#fff5f5',
              color: '#991b1b',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}>
              {cuisine}
            </span>
          ))}
        </div>
      )}

      {/* How it works */}
      <div
        style={{
          marginBottom: spacing.lg,
          padding: spacing.md,
          backgroundColor: statusColors.neutral50,
          border: `1px solid ${statusColors.neutral200}`,
          borderRadius: radius.lg,
        }}
      >
        <h3
          style={{
            margin: `0 0 ${spacing.xs}`,
            fontSize: typography.sizes.sm,
            fontWeight: typography.weights.semibold,
            color: statusColors.neutral800,
          }}
        >
          {t('events.how_it_works', locale)}
        </h3>
        <ol
          style={{
            margin: 0,
            paddingLeft: spacing.md,
            display: 'flex',
            flexDirection: 'column',
            gap: spacing['2xs'],
          }}
        >
          {(vertical === 'food_trucks' ? [
            t('events.ft_step1', locale),
            t('events.ft_step2', locale),
            t('events.ft_step3', locale),
            t('events.ft_step4', locale),
            t('events.ft_step5', locale),
          ] : [
            t('events.fm_step1', locale),
            t('events.fm_step2', locale),
            t('events.fm_step3', locale),
            t('events.fm_step4', locale),
            t('events.fm_step5', locale),
          ]).map((step, i) => (
            <li
              key={i}
              style={{
                fontSize: typography.sizes.sm,
                color: statusColors.neutral600,
                lineHeight: 1.5,
              }}
            >
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* Value props */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: spacing.sm,
          marginBottom: spacing.lg,
        }}
      >
        {(vertical === 'food_trucks' ? [
          {
            title: t('events.ft_val1_title', locale),
            desc: t('events.ft_val1_desc', locale),
          },
          {
            title: t('events.ft_val2_title', locale),
            desc: t('events.ft_val2_desc', locale),
          },
          {
            title: t('events.ft_val3_title', locale),
            desc: t('events.ft_val3_desc', locale),
          },
          {
            title: t('events.ft_val4_title', locale),
            desc: t('events.ft_val4_desc', locale),
          },
        ] : [
          {
            title: t('events.fm_val1_title', locale),
            desc: t('events.fm_val1_desc', locale),
          },
          {
            title: t('events.fm_val2_title', locale),
            desc: t('events.fm_val2_desc', locale),
          },
          {
            title: t('events.fm_val3_title', locale),
            desc: t('events.fm_val3_desc', locale),
          },
          {
            title: t('events.fm_val4_title', locale),
            desc: t('events.fm_val4_desc', locale),
          },
        ]).map((prop, i) => (
          <div
            key={i}
            style={{
              padding: spacing.sm,
              backgroundColor: 'white',
              border: `1px solid ${statusColors.neutral200}`,
              borderRadius: radius.md,
            }}
          >
            <p
              style={{
                margin: `0 0 ${spacing['3xs']}`,
                fontSize: typography.sizes.sm,
                fontWeight: typography.weights.semibold,
                color: statusColors.neutral800,
              }}
            >
              {prop.title}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: typography.sizes.xs,
                color: statusColors.neutral500,
                lineHeight: 1.4,
              }}
            >
              {prop.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Request form */}
      <div
        style={{
          padding: spacing.md,
          backgroundColor: 'white',
          border: `1px solid ${statusColors.neutral200}`,
          borderRadius: radius.lg,
        }}
      >
        <h2
          style={{
            margin: `0 0 ${spacing.sm}`,
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.semibold,
            color: statusColors.neutral800,
          }}
        >
          {term(vertical, 'event_request_heading', locale)}
        </h2>
        <EventRequestForm vertical={vertical} vendorPreference={vendorPreference} />
      </div>

      {/* Why work with us — social proof + trust signals */}
      {isFT && (
        <div style={{
          marginTop: 32,
          padding: spacing.md,
          backgroundColor: '#1a1a1a',
          borderRadius: radius.lg,
          color: 'white',
        }}>
          <h3 style={{ margin: `0 0 ${spacing.sm}`, fontSize: typography.sizes.base, fontWeight: 700, color: '#ff5757' }}>
            Why Event Managers Choose Us
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { icon: '✅', text: 'Every truck is verified, insured, and event-approved' },
              { icon: '🍽️', text: 'Diverse cuisines — tacos, BBQ, Asian, pizza, Mediterranean, and more' },
              { icon: '📱', text: 'Guests pre-order online so food is ready when they arrive' },
              { icon: '📋', text: 'We handle truck coordination — you focus on your event' },
              { icon: '💰', text: 'Transparent pricing with no hidden fees' },
            ].map(item => (
              <div key={item.text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                <span style={{ fontSize: 14, color: '#d1d5db', lineHeight: 1.5 }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
