import Link from 'next/link'
import { CateringRequestForm } from '@/components/catering/CateringRequestForm'
import { statusColors, spacing, typography, radius } from '@/lib/design-tokens'

interface CateringPageProps {
  params: Promise<{ vertical: string }>
}

export default async function CateringPage({ params }: CateringPageProps) {
  const { vertical } = await params

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
          ← Back
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
          Corporate Catering
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
          Bring food trucks to your office, event, or company gathering.
          Your employees order and pick up their meals — no catering trays,
          no leftovers, just great food.
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
          How It Works
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
          {[
            'Submit your event details below',
            'We match you with food trucks that fit your needs',
            'Share the event link with your team',
            'Employees pre-order and choose a pickup time',
            'Trucks arrive with meals ready — no long lines',
          ].map((step, i) => (
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
        {[
          {
            title: 'No Catering Trays',
            desc: 'Fresh, made-to-order meals your team actually wants.',
          },
          {
            title: 'Pre-Order System',
            desc: 'Employees order ahead — trucks prep exactly what\'s needed.',
          },
          {
            title: 'Time Slot Pickup',
            desc: 'Staggered pickup times mean no crowds, no waiting.',
          },
          {
            title: 'Zero Waste',
            desc: 'Every meal is spoken for. No guessing, no leftovers.',
          },
        ].map((prop, i) => (
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
          Request Food Trucks for Your Event
        </h2>
        <CateringRequestForm vertical={vertical} />
      </div>
    </div>
  )
}
