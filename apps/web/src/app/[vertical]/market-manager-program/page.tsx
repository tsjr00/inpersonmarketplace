import { Metadata } from 'next'
import Link from 'next/link'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import { getEmailFromAddress } from '@/lib/notifications/email-config'
import { calculateBoothRentalFees, formatPrice, FEES } from '@/lib/pricing'
import { defaultBranding } from '@/lib/branding/defaults'
import { breadcrumbJsonLd } from '@/lib/marketing/json-ld'
import ManagerIntakeForm from '@/components/landing/ManagerIntakeForm'

/**
 * Public landing page for the manager/operator program.
 *
 * Marketing surface + intake form. No auth — visible to anyone.
 * Vertical-aware:
 *   - farmers_market → Market Manager Program (booth rentals, seasons)
 *   - food_trucks    → Park Operator Program (paid spots, weekly holds)
 *
 * The intake form posts the vertical to /api/market-manager/intake,
 * which creates a matching `markets` row (FT → park_mode='paid') and
 * sends brand-correct confirmation emails. Copy lives in the `copy`
 * object below so both verticals share one page + one form.
 *
 * The booth-fee worked example is DERIVED from pricing.ts (not hardcoded)
 * so it can never drift from the real fee model.
 */

interface MarketManagerProgramPageProps {
  params: Promise<{ vertical: string }>
}

export async function generateMetadata({ params }: MarketManagerProgramPageProps): Promise<Metadata> {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const isFT = vertical === 'food_trucks'

  return {
    title: isFT
      ? `Food Truck Park Operator Program — List Your Park Online | ${branding.brand_name}`
      : `Farmers Market Manager Program — Manage Booths & Vendors Online | ${branding.brand_name}`,
    description: isFT
      ? 'Run your food truck park with spot rentals, truck vetting, day-of check-ins, and post-service surveys — no subscription. We take a small percentage of the spot fees.'
      : 'Run your farmers market with weekly booth rentals, vendor onboarding, attendance tracking, and post-market surveys — no subscription. We take a small percentage of the booth fees.',
  }
}

export default async function MarketManagerProgramPage({ params }: MarketManagerProgramPageProps) {
  const { vertical } = await params
  const isFT = vertical === 'food_trucks'
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const baseUrl = `https://${branding.domain}`

  const contactEmail = getEmailFromAddress(vertical)
  const contactSubject = isFT
    ? 'Park Operator Program Inquiry'
    : 'Market Manager Program Inquiry'
  const contactMailto = `mailto:${contactEmail}?subject=${encodeURIComponent(contactSubject)}`

  // Booth-fee worked example, derived from the single source (pricing.ts) so the
  // numbers on this page can never go stale if the fee model changes.
  const boothFees = calculateBoothRentalFees(2500) // $25.00 sample booth (FM)
  const spotFees = calculateBoothRentalFees(4000) // $40.00 sample spot (FT) — relatable everyday spot price
  const orderPct = FEES.buyerFeePercent

  const breadcrumbs = breadcrumbJsonLd([
    { name: 'Home', url: `${baseUrl}/${vertical}` },
    {
      name: isFT ? 'Park Operator Program' : 'Market Manager Program',
      url: `${baseUrl}/${vertical}/market-manager-program`,
    },
  ])

  const copy = isFT
    ? {
        heroHeadline:
          "Built for food truck park operators who'd rather run their lot than chase down who paid for which Friday.",
        heroSubtitle:
          "Spot rentals, truck vetting, day-of check-ins, post-service surveys. You don't pay us a subscription. We take a small percentage of the spot fees at your park.",
        wedgeBody1:
          "Running a food truck park means juggling which trucks are booked which day, who paid, who's parking where, and who actually showed up. Some operators keep it in a group text; some keep it in their head. Either way it's a lot to hold onto every service day.",
        wedgeBody2:
          "This tool takes that part off your plate. Trucks book and pay for spots through us. You get the booking, the payment, and the spot assigned — plus a day-of view of who's on-site. You're still the one running your park; there's just less to chase down.",
        cards: [
          {
            title: '🚚 Operator dashboard',
            body: 'Truck roster with spot assignments, day-of check-ins, weekly bookings, spot-revenue summary, post-service surveys. The operations view of your park.',
          },
          {
            title: '✅ Truck vetting',
            body: 'Verify each truck (business info, permits, insurance) plus the per-park agreement statements you select. Block a truck or bar a booking when you need to.',
          },
          {
            title: '📅 Spot bookings & weekly holds',
            body: "Trucks book and pay for a single day, or request a recurring weekly hold. You set the price per spot; we handle payment and route your share to your Stripe account.",
          },
          {
            title: '📍 Day-of check-ins',
            body: 'See which trucks are booked each day and who has actually checked in on-site, with location-verified check-ins for compliance.',
          },
          {
            title: '📊 Post-service surveys',
            body: 'After each service day we survey the trucks that attended and the shoppers who picked up an order at your park. You see the aggregate and the individual responses.',
          },
          {
            title: '🤝 No subscription',
            body: 'Nothing to pay us monthly. We charge a percentage of each spot rental at your park. Receipts show the fee.',
          },
        ],
        steps: [
          {
            title: 'Sign up.',
            rest: 'Fill out the form below — name, email, park name, location. Takes a minute.',
          },
          {
            title: 'Set up your dashboard.',
            rest: 'We email you a link. You turn on paid spots, add your spots (size, power, water, daily price), and connect a Stripe account.',
          },
          {
            title: 'Create your custom park agreement.',
            rest: 'In a couple of clicks, assemble the agreement every truck must accept before they can book a spot — so every vendor on the platform knows your park’s standards and agrees to follow them up front. Start from ready-made statements or add your own; it takes a minute.',
          },
          {
            title: 'We review and activate.',
            rest: 'Usually within one business day. Your park goes public; trucks can find it.',
          },
          {
            title: 'Refer your trucks.',
            rest: "Use the invite link to send trucks you already work with a co-branded signup flow — your park name shown alongside Food Truck'n.",
          },
          {
            title: 'Run your park.',
            rest: 'Trucks book and pay for spots. Shoppers pre-order. Surveys go out after service day. We deposit spot rental income to your Stripe account.',
          },
        ],
        setupHeading: 'Set up your park',
        setupSubtitle:
          'A few fields here gets you a dashboard. You finish setup there (paid spots, spot inventory, your custom park agreement, Stripe). We review and activate your public listing within one business day.',
        pricingLead:
          'Nothing to you up front. No subscription, no seat fee, no per-truck charge.',
        pricingIntro:
          "We don't make money unless you do. When a truck rents a spot, the truck pays a small premium for booking and paying online, and you pay a small percentage for everything the platform runs for you — your operator dashboard and spot-revenue reports, truck vetting, day-of check-ins, a custom park agreement, messaging your trucks, post-service surveys, a co-branded invite to bring trucks on, and all the payment handling. The exact split is on every receipt before anyone pays:",
        pricingBullets: [
          {
            label: 'The truck pays',
            body: 'your spot price plus a small platform premium — the convenience of booking and paying online.',
          },
          {
            label: 'You receive',
            body: 'your spot price minus a small platform-access percentage, deposited straight to your Stripe account.',
          },
        ],
        pricingExample: {
          heading: `Example — a ${formatPrice(4000)} spot`,
          rows: [
            { label: 'Truck pays', value: `${formatPrice(spotFees.vendorPaysCents)}  (your ${formatPrice(4000)} spot + platform premium)` },
            { label: 'You receive', value: `${formatPrice(spotFees.managerReceivesCents)}  (your ${formatPrice(4000)} spot − platform access)` },
            { label: 'Deposited to', value: 'your Stripe account, automatically' },
          ],
        },
        pricingNote:
          "Trucks can still take pre-orders through the platform at the standard fee — that works the same as anywhere else on Food Truck'n and isn't part of your spot revenue.",
        finalCtaSubtitle:
          "We're onboarding parks a few at a time so we can do it right. Tell us about yours below — setup takes about a minute, and we'll have your dashboard active within one business day.",
      }
    : {
        heroHeadline:
          'Built for farmers market managers, by people who got tired of watching them do the same paperwork by hand every week.',
        heroSubtitle:
          "Weekly booth rentals, vendor onboarding, attendance, post-market surveys. You don't pay us a subscription. We take a small percentage of the booth fees and the on-platform transactions at your market.",
        wedgeBody1:
          "Lots of farmers markets can't fill all their booths with season-long contracts — weather, crop timing, vendor mix, or just how the manager prefers to run things. So weekly drop-in vendors fill those spots. But the paperwork is awkward: who paid for which week, who's where in the layout, what they sold. Some markets keep it in a notebook; some don't track it at all.",
        wedgeBody2:
          "This tool takes that part off your plate. Weekly vendors book and pay through us. You get the booking, the receipt, and the booth assigned. You're still the one running your market — there's just less to chase down.",
        cards: [
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
        ],
        steps: [
          {
            title: 'Sign up.',
            rest: 'Fill out the form below — name, email, market name, location. Takes a minute.',
          },
          {
            title: 'Set up your dashboard.',
            rest: 'We email you a link. You configure your booth inventory (sizes, count, weekly price), and connect a Stripe account.',
          },
          {
            title: 'Create your custom market agreement.',
            rest: 'In a couple of clicks, assemble the agreement every vendor must accept before they can book a booth — so every vendor on the platform knows your market’s standards and agrees to follow them up front. Start from ready-made statements or add your own; it takes a minute.',
          },
          {
            title: 'We review and activate.',
            rest: 'Usually within one business day. Your market goes public; vendors can find it.',
          },
          {
            title: 'Refer your vendors.',
            rest: 'Use the invite a vendor link to send your existing vendors a co-branded signup flow — your market name shown alongside Farmers Marketing.',
          },
          {
            title: 'Run your market.',
            rest: 'Vendors pay weekly. Buyers pre-order. Surveys go out after market day. We deposit booth rental income to your Stripe account.',
          },
        ],
        setupHeading: 'Set up your market',
        setupSubtitle:
          'A few fields here gets you a dashboard. You finish setup there (booth inventory, your custom market agreement, Stripe). We review and activate your public listing within one business day.',
        pricingLead:
          'Nothing to you up front. No subscription, no seat fee, no per-vendor charge.',
        pricingIntro:
          "We don't make money unless you do. When a vendor rents a booth, the vendor pays a small premium for booking and paying online, and you pay a small percentage for everything the platform runs for you — your manager dashboard and revenue reports, vendor onboarding and vetting, attendance tracking, a custom market agreement, messaging your vendors, one-tap sharing of your profile and market-day lineup, post-market surveys, and all the payment handling. The exact split is on every receipt before anyone pays:",
        pricingBullets: [
          {
            label: 'The vendor pays',
            body: 'your booth price plus a small platform premium — the convenience of booking and paying online.',
          },
          {
            label: 'You receive',
            body: 'your booth price minus a small platform-access percentage, deposited straight to your Stripe account.',
          },
        ],
        pricingExample: {
          heading: `Example — a ${formatPrice(2500)} booth`,
          rows: [
            { label: 'Vendor pays', value: `${formatPrice(boothFees.vendorPaysCents)}  (your ${formatPrice(2500)} booth + platform premium)` },
            { label: 'You receive', value: `${formatPrice(boothFees.managerReceivesCents)}  (your ${formatPrice(2500)} booth − platform access)` },
            { label: 'Deposited to', value: 'your Stripe account, automatically' },
          ],
        },
        pricingNote:
          `On-platform pre-order sales at your market use the same small fee (${orderPct}% each side) every vendor and buyer already sees — nothing extra to you.`,
        finalCtaSubtitle:
          "We're onboarding markets a few at a time so we can do it right. Tell us about yours below — setup takes about a minute, and we'll have your dashboard active within one business day.",
      }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
    }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
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
            {copy.heroHeadline}
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
            {copy.heroSubtitle}
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
            {copy.wedgeBody1}
          </p>
          <p style={{
            margin: 0,
            color: colors.textMuted,
            lineHeight: 1.6,
          }}>
            {copy.wedgeBody2}
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
            {copy.cards.map((card) => (
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
            {copy.steps.map((step) => (
              <li key={step.title} style={{ marginBottom: spacing.sm }}>
                <strong style={{ color: colors.textPrimary }}>{step.title}</strong>{' '}
                {step.rest}
              </li>
            ))}
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
            {copy.setupHeading}
          </h2>
          <p style={{
            margin: 0,
            marginBottom: spacing.md,
            color: colors.textMuted,
            fontSize: typography.sizes.base,
            lineHeight: 1.5,
          }}>
            {copy.setupSubtitle}
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
            {copy.pricingLead}
          </p>
          <p style={{
            margin: 0,
            marginBottom: spacing.xs,
            color: colors.textPrimary,
            lineHeight: 1.6,
          }}>
            {copy.pricingIntro}
          </p>
          <ul style={{
            margin: 0,
            paddingLeft: spacing.lg,
            color: colors.textPrimary,
            lineHeight: 1.7,
          }}>
            {copy.pricingBullets.map((bullet) => (
              <li key={bullet.label}>
                <strong>{bullet.label}</strong> {bullet.body}
              </li>
            ))}
          </ul>
          {/* Labeled worked example (tester finding 2026-07-23): show the math
              cleanly instead of burying it in a paragraph. Numbers derived from
              pricing.ts so they can't drift. */}
          <div style={{
            marginTop: spacing.md,
            padding: spacing.md,
            backgroundColor: colors.surfaceBase,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            maxWidth: 460,
          }}>
            <div style={{ fontWeight: typography.weights.bold, color: colors.textPrimary, marginBottom: spacing.xs }}>
              {copy.pricingExample.heading}
            </div>
            {copy.pricingExample.rows.map((row) => (
              <div key={row.label} style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing['3xs'], lineHeight: 1.5 }}>
                <span style={{ minWidth: 96, color: colors.textMuted }}>{row.label}</span>
                <span style={{ color: colors.textPrimary, fontWeight: typography.weights.medium }}>{row.value}</span>
              </div>
            ))}
          </div>
          {copy.pricingNote && (
            <p style={{
              margin: `${spacing.sm} 0 0 0`,
              color: colors.textPrimary,
              lineHeight: 1.6,
              fontSize: typography.sizes.sm,
            }}>
              {copy.pricingNote}
            </p>
          )}
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
            {copy.finalCtaSubtitle}
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
