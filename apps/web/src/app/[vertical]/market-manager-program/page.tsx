'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'

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
            Run your market with us — keep the margin you&apos;d lose to a software bill.
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
            We help farmers market managers fill weekly booth spots, vet vendors,
            track attendance, and capture post-market feedback. No subscription.
            We make money when your booth rentals and on-platform transactions do.
          </p>
          <a
            href={contactMailto}
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
            Contact us about onboarding your market
          </a>
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
            The week-to-week vendor problem
          </h2>
          <p style={{
            margin: 0,
            marginBottom: spacing.sm,
            color: colors.textMuted,
            lineHeight: 1.6,
          }}>
            Most markets try to lock vendors in for the whole season. Some markets
            can&apos;t fill all their spots that way — climate, crop variety,
            vendor mix, or the manager&apos;s overhead just doesn&apos;t support
            it. Those weekly drop-in vendors are real revenue, but tracking who
            paid for which week, who&apos;s set up where, and what they sold gets
            messy fast.
          </p>
          <p style={{
            margin: 0,
            color: colors.textMuted,
            lineHeight: 1.6,
          }}>
            That&apos;s the problem we solve. You point your weekly vendors at our
            platform, they pay for a booth and a week through us, you get the spot
            assigned and the receipt — and you keep doing what you already do, just
            with less paperwork.
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
                body: 'Vendor list with booth assignments, attendance, weekly bookings, aggregate transaction count, and post-market surveys. Built for the operations side of running a market.',
              },
              {
                title: '✅ Vendor vetting',
                body: 'Three-gate verification (business, category-specific permits, insurance) plus the per-market opt-in agreement statements you select during onboarding. Skip the back-and-forth with new vendor applications.',
              },
              {
                title: '📅 Weekly booth bookings',
                body: 'Vendors pay you weekly through the platform. Pricing per booth size that you set. Booth assignment is yours to control — auto or manual, your call.',
              },
              {
                title: '📣 Share tools',
                body: 'One-tap share buttons for your market profile and market-day vendor lineup. Built-in templates for social posts.',
              },
              {
                title: '📊 Survey-driven feedback',
                body: 'After each market day, the platform pushes a star + comment survey to every vendor and to every shopper who picked up an order at your market. Aggregate ratings, individual comments, real signal on what worked.',
              },
              {
                title: '🤝 No subscription',
                body: 'You pay nothing to us. We collect a 6.5% fee on each side of the booth rental and the transactions. Vendors and shoppers each see a small platform fee on their receipt — same as every other tool in this space, but no monthly seat charge to you.',
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
              <strong style={{ color: colors.textPrimary }}>Reach out.</strong> Email us at the address below.
              We&apos;ll set up a call to walk through your market and confirm fit.
            </li>
            <li style={{ marginBottom: spacing.sm }}>
              <strong style={{ color: colors.textPrimary }}>We assign you to your market.</strong> Once you have an account,
              you&apos;ll see a &ldquo;My Markets&rdquo; card on your dashboard with a
              link to your manager dashboard. Your manager role is separate from
              any vendor role you might also have on the platform — they don&apos;t
              cross-contaminate.
            </li>
            <li style={{ marginBottom: spacing.sm }}>
              <strong style={{ color: colors.textPrimary }}>Onboard your market.</strong> Set up your booth inventory
              (count + sizes + weekly prices). Pick the opt-in vendor agreement
              statements that fit how your market operates. Connect a Stripe
              account so we can pay you booth rental revenue.
            </li>
            <li style={{ marginBottom: spacing.sm }}>
              <strong style={{ color: colors.textPrimary }}>Refer your vendors.</strong> Use the &ldquo;invite a
              vendor&rdquo; link to send vendors a co-branded onboarding flow —
              your market name shown alongside Farmers Marketing. They sign up,
              accept your agreement, pay for a booth, and you assign them to a
              spot.
            </li>
            <li style={{ marginBottom: spacing.sm }}>
              <strong style={{ color: colors.textPrimary }}>Run your market.</strong> Vendors pay weekly. Buyers
              pre-order from those vendors. Surveys go out after market day.
              You see the data; we send you your booth rental income.
            </li>
          </ol>
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
            <strong>Zero subscription. Zero seat fee. Zero per-vendor charge to you as the manager.</strong>
          </p>
          <p style={{
            margin: 0,
            marginBottom: spacing.xs,
            color: colors.textPrimary,
            lineHeight: 1.6,
          }}>
            We make money in two places, both transparent on every receipt:
          </p>
          <ul style={{
            margin: 0,
            paddingLeft: spacing.lg,
            color: colors.textPrimary,
            lineHeight: 1.7,
          }}>
            <li>
              <strong>Booth rentals:</strong> 6.5% on each side. The vendor pays
              your booth fee plus 6.5%; you receive your booth fee minus 6.5%.
              We keep the difference. (For a $25 booth: vendor pays $26.63,
              you receive $23.38.)
            </li>
            <li>
              <strong>Pre-order transactions at your market:</strong> 6.5% on each
              side, same as our standard pre-order flow. This is the same fee
              every vendor and shopper already sees on the platform — your
              market is now where some of those transactions happen.
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
            Want to talk?
          </h2>
          <p style={{
            margin: 0,
            marginBottom: spacing.md,
            color: colors.textMuted,
            fontSize: typography.sizes.base,
          }}>
            We&apos;re onboarding a small group of friendly markets to start.
            Reach out, tell us about your market, and we&apos;ll see if it&apos;s
            a fit.
          </p>
          <a
            href={contactMailto}
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
            updates@mail.farmersmarketing.app
          </a>
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
