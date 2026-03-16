import Link from 'next/link'
import { EventRequestForm } from '@/components/events/EventRequestForm'
import { statusColors, spacing, typography, radius } from '@/lib/design-tokens'
import { term } from '@/lib/vertical/terminology'
import { getLocale } from '@/lib/locale/server'
import { t } from '@/lib/locale/messages'

interface CateringPageProps {
  params: Promise<{ vertical: string }>
}

export default async function CateringPage({ params }: CateringPageProps) {
  const { vertical } = await params
  const locale = await getLocale()

  const accent = vertical === 'food_trucks' ? '#ff5757' : '#2d5016'

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
      </div>

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
        <EventRequestForm vertical={vertical} />
      </div>
    </div>
  )
}
