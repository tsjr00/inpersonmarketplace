'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'

export default function HowItWorksPage() {
  const params = useParams()
  const vertical = params.vertical as string

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: colors.surfaceBase,
    }}>
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${colors.primaryDark || '#689F38'} 0%, ${colors.primary} 100%)`,
        color: 'white',
        padding: `${spacing['2xl']} ${spacing.md}`,
        textAlign: 'center',
      }}>
        <Image
          src="/logos/logo-icon-color.png"
          alt="Fresh Market"
          width={64}
          height={64}
          style={{ marginBottom: spacing.sm, borderRadius: radius.full, background: 'white', padding: '6px' }}
        />
        <h1 style={{
          fontSize: typography.sizes['3xl'],
          fontWeight: typography.weights.bold,
          margin: `0 0 ${spacing.xs} 0`,
        }}>
          How It Works
        </h1>
        <p style={{
          fontSize: typography.sizes.lg,
          opacity: 0.9,
          margin: 0,
          maxWidth: '600px',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          A simple guide to ordering, pickup, and confirmation
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
          <a href="#buyers" style={linkChipStyle}>For Buyers</a>
          <a href="#vendors" style={linkChipStyle}>For Vendors</a>
          <a href="#pickup" style={linkChipStyle}>Pickup Guide</a>
          <a href="#cancellations" style={linkChipStyle}>Cancellations</a>
        </div>

        {/* === FOR BUYERS === */}
        <section id="buyers" style={{ marginBottom: spacing.xl }}>
          <SectionHeader title="For Buyers" subtitle="Ordering & Pickup Process" accent={colors.primary} />

          <StepList steps={[
            `Browse ${term(vertical, 'products').toLowerCase()} from local ${term(vertical, 'vendors').toLowerCase()}`,
            'Add items to your cart',
            'Complete checkout with secure payment',
            'Vendor confirms your order and prepares items',
            'You receive notification when items are ready for pickup',
            'Visit the market on pickup day',
            `Find the ${term(vertical, 'vendor').toLowerCase()} and present your order details`,
            `${term(vertical, 'vendor')} verifies you and your order number`,
            'Vendor hands you your items',
            `Both you and ${term(vertical, 'vendor').toLowerCase()} confirm the handoff`,
          ]} />

          <InfoCard title="The Pickup Confirmation Step" variant="green">
            <p>After the vendor hands you your items:</p>
            <ol style={{ paddingLeft: '1.2rem', margin: `${spacing.xs} 0` }}>
              <li>Tap <strong>&quot;Acknowledge Receipt&quot;</strong> in your app</li>
              <li>Vendor confirms on their end within 30 seconds</li>
              <li>Both see a green confirmation screen</li>
            </ol>
            <p style={{ fontWeight: typography.weights.semibold, margin: `${spacing.xs} 0 0 0` }}>
              This protects both you and the vendor by ensuring both parties agree the handoff happened.
            </p>
          </InfoCard>

          <InfoCard title="What If Something Goes Wrong?" variant="amber">
            <ul style={{ paddingLeft: '1.2rem', margin: `${spacing.xs} 0` }}>
              <li><strong>Items missing?</strong> Tap &quot;I Did Not Receive This&quot; instead of confirming</li>
              <li><strong>Wrong items?</strong> Work it out directly with the vendor at the booth</li>
              <li><strong>Vendor not at market?</strong> Check the market schedule and vendor contact info on your order</li>
            </ul>
          </InfoCard>
        </section>

        {/* === FOR VENDORS === */}
        <section id="vendors" style={{ marginBottom: spacing.xl }}>
          <SectionHeader title="For Vendors" subtitle="Order Flow & Pickup Process" accent={colors.primaryDark || '#689F38'} />

          <StepList steps={[
            'Receive order notification',
            'Confirm you can fulfill the order',
            `Prepare items before ${term(vertical, 'market_day').toLowerCase()}`,
            'Mark items as "Ready for Pickup" when prepared',
            'Buyer receives notification that items are ready',
            `Buyer arrives at your location on ${term(vertical, 'market_day').toLowerCase()}`,
            'Verify the buyer and the order number',
            'Hand over all items',
            'When buyer acknowledges receipt, tap "Yes, I Handed It Off" within 30 seconds',
            'See green confirmation screen',
          ]} />

          <InfoCard title="Why Confirmation Matters" variant="green">
            <ul style={{ paddingLeft: '1.2rem', margin: `${spacing.xs} 0` }}>
              <li>Payment transfer is not initiated until <strong>both parties confirm</strong></li>
              <li>If you don&apos;t confirm within 30 seconds, you&apos;ll see an urgent prompt</li>
              <li>After 8 hours, other actions are blocked until you resolve the pending confirmation</li>
              <li>This protects both you and your customers</li>
            </ul>
          </InfoCard>

          <InfoCard title="Best Practices" variant="blue">
            <ul style={{ paddingLeft: '1.2rem', margin: `${spacing.xs} 0` }}>
              <li>{`Stay at your location during ${term(vertical, 'market_hours').toLowerCase()}`}</li>
              <li>Have your phone charged and app open</li>
              <li>Confirm handoffs immediately &mdash; don&apos;t wait</li>
              <li>Verify the buyer and the order number before handing over items</li>
              <li>If there&apos;s an issue, tap &quot;Report Issue&quot; instead of confirming</li>
            </ul>
          </InfoCard>

          <InfoCard title="Payment Timing" variant="default">
            <ul style={{ paddingLeft: '1.2rem', margin: `${spacing.xs} 0` }}>
              <li>Payment transfers are initiated after both parties confirm</li>
              <li>Track your payouts and financial details in your{' '}
                <a
                  href="https://dashboard.stripe.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: colors.primary, fontWeight: typography.weights.semibold }}
                >
                  Stripe Dashboard
                </a>
              </li>
              <li>You can track order statuses on your vendor dashboard</li>
            </ul>
          </InfoCard>
        </section>

        {/* === PICKUP GUIDE === */}
        <section id="pickup" style={{ marginBottom: spacing.xl }}>
          <SectionHeader title="Pickup Guide" subtitle="Step-by-step for both parties" accent={colors.accent} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: spacing.md }}>
            <div style={cardStyle}>
              <h3 style={{ margin: `0 0 ${spacing.sm} 0`, color: colors.primary, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                Buyers
              </h3>
              <ol style={{ paddingLeft: '1.2rem', margin: 0, lineHeight: typography.leading.relaxed }}>
                <li>Open your order details</li>
                <li>Present your order information to the vendor</li>
                <li>Verify you received all items</li>
                <li>Tap &quot;Acknowledge Receipt&quot;</li>
                <li>Wait for vendor to confirm (30 seconds)</li>
                <li>Green screen = you&apos;re done!</li>
                <li><strong>Don&apos;t leave until you see the green screen</strong></li>
              </ol>
            </div>

            <div style={cardStyle}>
              <h3 style={{ margin: `0 0 ${spacing.sm} 0`, color: colors.primaryDark || '#689F38', fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                Vendors
              </h3>
              <ol style={{ paddingLeft: '1.2rem', margin: 0, lineHeight: typography.leading.relaxed }}>
                <li>Check your dashboard for ready orders</li>
                <li>When buyer arrives, verify the buyer and the order number</li>
                <li>Hand over all items</li>
                <li>Wait for buyer to confirm</li>
                <li>When notified, tap &quot;Yes, I Handed It Off&quot;</li>
                <li>Green screen = payment transfer is initiated</li>
                <li><strong>Never let buyer leave without both confirming</strong></li>
              </ol>
            </div>
          </div>
        </section>

        {/* === CANCELLATIONS === */}
        <section id="cancellations" style={{ marginBottom: spacing.xl }}>
          <SectionHeader title="Cancellation Policy" subtitle="What happens when plans change" accent={colors.accent} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: spacing.md }}>
            <InfoCard title="Before Vendor Confirms" variant="green">
              <p style={{ margin: `${spacing.xs} 0`, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                Free Cancellation
              </p>
              <p style={{ margin: 0 }}>
                Cancel before the vendor confirms your order for a full refund. The first hour after placing your order is always penalty-free, regardless of vendor status.
              </p>
            </InfoCard>

            <InfoCard title="After Vendor Confirms" variant="amber">
              <p style={{ margin: `${spacing.xs} 0`, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                25% Cancellation Fee
              </p>
              <p style={{ margin: 0 }}>
                Once the vendor has confirmed your order and the 1-hour grace window has passed, a 25% fee applies. This compensates the vendor for prep time and reserved items. You receive a 75% refund.
              </p>
            </InfoCard>
          </div>

          <p style={{
            marginTop: spacing.md,
            fontSize: typography.sizes.sm,
            color: colors.textMuted,
            textAlign: 'center',
          }}>
            Cancel as early as possible if your plans change. Vendors prepare items specifically for your order.
          </p>
        </section>

        {/* CTA */}
        <div style={{
          textAlign: 'center',
          padding: `${spacing.lg} 0`,
          borderTop: `1px solid ${colors.border}`,
        }}>
          <p style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>
            Ready to get started?
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
            {term(vertical, 'browse_products_cta')}
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
