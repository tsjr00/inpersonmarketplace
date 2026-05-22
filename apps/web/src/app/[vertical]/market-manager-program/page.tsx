'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import ManagerIntakeForm from '@/components/landing/ManagerIntakeForm'

/**
 * Public landing page for the Market Manager Program.
 *
 * Marketing surface that pitches the partnership to farmers market
 * managers. No auth — visible to anyone. CTA is a mailto contact;
 * formal application/onboarding flow ships in a later phase per
 * market_manager_v2_plan.md Phase 5.
 *
 * Vertical scope: rendered for any vertical, but the FM context is
 * what's described. FT park-operator equivalent is a separate persona,
 * deferred. If this page is loaded on /food_trucks/market-manager-program
 * the copy still reads as FM (acceptable for v1; revisit when FT
 * persona ships).
 */
export default function MarketManagerProgramPage() {
  const params = useParams()
  const vertical = (params?.vertical as string) || 'farmers_market'
  const contactMailto =
    'mailto:updates@mail.farmersmarketing.app?subject=Market%20Manager%20Program%20Inquiry'

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
    }}>
      <div style={{
        maxWidth: containers.lg,
        margin: '0 auto',
        padding: `${spacing.xl} ${spacing.md}`,
      }}>
        {/* Hero */}
        <section style={{ textAlign: 'center', marginBottom: spacing.xl }}>
          <h1 style={{
            margin: 0,
            marginBottom: spacing.sm,
            fontSize: typography.sizes['3xl'],
            fontWeight: typography.weights.bold,
            color: colors.textPrimary,
            lineHeight: 1.2,
          }}>
            Built for farmers market managers, by people who got tired of watching them do the same paperwork by hand every week.
          </h1>
          <p style={{
            margin: 0,
            marginBottom: spacing.md,
            fontSize: typography.sizes.lg,
            color: colors.textMuted,
            lineHeight: 1.5,
            maxWidth: 720,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}>
            Weekly booth rentals, vendor onboarding, attendance, post-market surveys.
            You don&apos;t pay us a subscription. We take a small percentage of the
            booth fees and the on-platform transactions at your market.
          </p>
          <div style={{ display: 'flex', gap: spacing.sm, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            <a
              href="#get-started"
              style={{
                display: 'inline-block',
                padding: `${spacing.sm} ${spacing.lg}`,
                backgroundColor: colors.primary,
                color: 'white',
                textDecoration: 'none',
                borderRadius: radius.md,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold,
              }}
            >
              Get started →
            </a>
            <a
              href={contactMailto}
              style={{
                color: colors.textMuted,
                fontSize: typography.sizes.sm,
                textDecoration: 'underline',
              }}
            >
              Have questions? Email us
            </a>
          </div>
        </section>

        {/* The wedge — what's broken about the status quo */}
        <section style={{
          marginBottom: spacing.xl,
          padding: spacing.lg,
          backgroundColor: colors.surfaceElevated,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
        }}>
          <h2 style={{
            marginTop: 0,
            marginBottom: spacing.sm,
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.bold,
            color: colors.textPrimary,
          }}>
            Why we built this
          </h2>
          <p style={{
            margin: 0,
            marginBottom: spacing.sm,
            color: colors.textMuted,
            lineHeight: 1.6,
          }}>
            Lots of farmers markets can&apos;t fill all their booths with season-long
            contracts — weather, crop timing, vendor mix, or just how the manager
            prefers to run things. So weekly drop-in vendors fill those spots. But
            the paperwork is awkward: who paid for which week, who&apos;s where in
            the layout, what they sold. Some markets keep it in a notebook; some
            don&apos;t track it at all.
          </p>
          <p style={{
            margin: 0,
            color: colors.textMuted,
            lineHeight: 1.6,
          }}>
            This tool takes that part off your plate. Weekly vendors book and pay
            through us. You get the booking, the receipt, and the booth assigned.
            You&apos;re still the one running your market — there&apos;s just less
            to chase down.
          </p>
        </section>

        {/* Value props grid */}
        <section style={{ marginBottom: spacing.xl }}>
          <h2 style={{
            marginTop: 0,
            marginBottom: spacing.md,
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.bold,
            color: colors.textPrimary,
            textAlign: 'center',
          }}>
            What you get
          </h2>
          <div style={{
            display: 'grid',
            gap: spacing.md,
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}>
            {[
              {
                title: '🌾 Manager dashboard',
                body: 'Vendor list with booth assignments, attendance, weekly bookings, transaction summary, post-market surveys. The operations view of your market.',
              },
              {
                title: '✅ Vendor vetting',
                body: 'Three-step verification (business info, category permits, insurance) plus the per-market opt-in statements you select. New vendors arrive already vetted.',
              },
              {
                title: '📅 Weekly booth bookings',
                body: 'Vendors book and pay weekly through the platform. You set the price per booth size; we handle the payment and route your share to your Stripe account.',
              },
              {
                title: '📣 Share tools',
                body: 'One-tap share buttons for your market profile and your market-day vendor lineup. Built-in templates for social posts.',
              },
              {
                title: '📊 Post-market surveys',
                body: 'After each market day we push a star + comment survey to every vendor who attended and every shopper who picked up an order at your market. You see the aggregate and the individual responses.',
              },
              {
                title: '🤝 No subscription',
                body: 'Nothing to pay us monthly. We charge a percentage of each booth rental and each on-platform transaction at your market. Receipts show the fee.',
              },
            ].map((card) => (
              <div
                key={card.title}
                style={{
                  padding: spacing.md,
                  backgroundColor: colors.surfaceElevated,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.md,
                }}
              >
                <h3 style={{
                  marginTop: 0,
                  marginBottom: spacing.xs,
                  fontSize: typography.sizes.base,
                  fontWeight: typography.weights.semibold,
                  color: colors.textPrimary,
                }}>
                  {card.title}
                </h3>
                <p style={{
                  margin: 0,
                  fontSize: typography.sizes.sm,
                  color: colors.textMuted,
                  lineHeight: 1.5,
                }}>
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How the partnership works */}
        <section style={{
          marginBottom: spacing.xl,
        }}>
          <h2 style={{
            marginTop: 0,
            marginBottom: spacing.md,
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.bold,
            color: colors.textPrimary,
            textAlign: 'center',
          }}>
            How it works
          </h2>
          <ol style={{
            margin: 0,
            paddingLeft: spacing.lg,
            color: colors.textMuted,
            lineHeight: 1.7,
            fontSize: typography.sizes.base,
          }}>
            <li style={{ marginBottom: spacing.sm }}>
              <strong style={{ color: colors.textPrimary }}>Sign up.</strong> Fill out
              the form below — name, email, market name, location. Takes a minute.
            </li>
            <li style={{ marginBottom: spacing.sm }}>
              <strong style={{ color: colors.textPrimary }}>Set up your dashboard.</strong>{' '}
              We email you a link. You configure your booth inventory (sizes, count,
              weekly price), pick the vendor agreement statements that fit how your
              market runs, and connect a Stripe account.
            </li>
            <li style={{ marginBottom: spacing.sm }}>
              <strong style={{ color: colors.textPrimary }}>We review and activate.</strong>{' '}
              Usually within one business day. Your market goes public; vendors can
              find it.
            </li>
            <li style={{ marginBottom: spacing.sm }}>
              <strong style={{ color: colors.textPrimary }}>Refer your vendors.</strong>{' '}
              Use the &ldquo;invite a vendor&rdquo; link to send your existing vendors
              a co-branded signup flow — your market name shown alongside Farmers
              Marketing.
            </li>
            <li style={{ marginBottom: spacing.sm }}>
              <strong style={{ color: colors.textPrimary }}>Run your market.</strong>{' '}
              Vendors pay weekly. Buyers pre-order. Surveys go out after market day.
              We deposit booth rental income to your Stripe account.
            </li>
          </ol>
        </section>

        {/* Intake form — captures the basics so the manager can start
            setting up their dashboard. Admin approves to make the
            market public-visible (status: 'pending' → 'active'). */}
        <section
          id="get-started"
          style={{
            marginBottom: spacing.xl,
            padding: spacing.lg,
            backgroundColor: colors.surfaceElevated,
            border: `2px solid ${colors.primary}`,
            borderRadius: radius.md,
            scrollMarginTop: spacing.lg,
          }}
        >
          <h2 style={{
            marginTop: 0,
            marginBottom: spacing['2xs'],
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.bold,
            color: colors.textPrimary,
          }}>
            Set up your market
          </h2>
          <p style={{
            margin: 0,
            marginBottom: spacing.md,
            color: colors.textMuted,
            fontSize: typography.sizes.base,
            lineHeight: 1.5,
          }}>
            A few fields here gets you a dashboard. You finish setup there
            (booth inventory, vendor agreement statements, Stripe). We review
            and activate your public listing within one business day.
          </p>
          <ManagerIntakeForm />
        </section>

        {/* Pricing transparency */}
        <section style={{
          marginBottom: spacing.xl,
          padding: spacing.lg,
          backgroundColor: colors.primaryLight,
          border: `1px solid ${colors.primary}`,
          borderRadius: radius.md,
        }}>
          <h2 style={{
            marginTop: 0,
            marginBottom: spacing.sm,
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.bold,
            color: colors.primaryDark,
          }}>
            What it costs
          </h2>
          <p style={{
            margin: 0,
            marginBottom: spacing.sm,
            color: colors.textPrimary,
            lineHeight: 1.6,
          }}>
            Nothing to you up front. No subscription, no seat fee, no per-vendor charge.
          </p>
          <p style={{
            margin: 0,
            marginBottom: spacing.xs,
            color: colors.textPrimary,
            lineHeight: 1.6,
          }}>
            We make money in two places. Both show on the receipts:
          </p>
          <ul style={{
            margin: 0,
            paddingLeft: spacing.lg,
            color: colors.textPrimary,
            lineHeight: 1.7,
          }}>
            <li>
              <strong>Booth rentals:</strong> 6.5% on each side plus a $0.15
              flat fee from the vendor. The vendor pays your booth fee + 6.5%
              + $0.15; you receive your booth fee minus 6.5%. We keep the
              difference. For a $25 booth: vendor pays $26.78, you receive
              $23.37.
            </li>
            <li>
              <strong>Pre-order transactions at your market:</strong> 6.5% on
              each side, same as our standard pre-order flow. Same fee every
              vendor and buyer already sees on the platform — your market is
              now where some of those transactions happen.
            </li>
          </ul>
        </section>

        {/* CTA */}
        <section style={{
          textAlign: 'center',
          padding: spacing.lg,
          backgroundColor: colors.surfaceElevated,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
        }}>
          <h2 style={{
            marginTop: 0,
            marginBottom: spacing.xs,
            fontSize: typography.sizes.xl,
            fontWeight: typography.weights.bold,
            color: colors.textPrimary,
          }}>
            Ready to go?
          </h2>
          <p style={{
            margin: 0,
            marginBottom: spacing.md,
            color: colors.textMuted,
            fontSize: typography.sizes.base,
          }}>
            We&apos;re onboarding markets a few at a time so we can do it right.
            Tell us about yours below — setup takes about a minute, and
            we&apos;ll have your dashboard active within one business day.
          </p>
          <div style={{ display: 'flex', gap: spacing.sm, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            <a
              href="#get-started"
              style={{
                display: 'inline-block',
                padding: `${spacing.sm} ${spacing.lg}`,
                backgroundColor: colors.primary,
                color: 'white',
                textDecoration: 'none',
                borderRadius: radius.md,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.semibold,
              }}
            >
              Get started →
            </a>
            <a
              href={contactMailto}
              style={{
                color: colors.textMuted,
                fontSize: typography.sizes.sm,
                textDecoration: 'underline',
              }}
            >
              Or email us
            </a>
          </div>
        </section>

        <div style={{ textAlign: 'center', marginTop: spacing.lg }}>
          <Link
            href={`/${vertical}`}
            style={{
              color: colors.textMuted,
              fontSize: typography.sizes.sm,
              textDecoration: 'none',
            }}
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
