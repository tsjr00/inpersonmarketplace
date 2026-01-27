'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'

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
        background: `linear-gradient(135deg, ${colors.primaryDark || '#1a472a'} 0%, ${colors.primary} 100%)`,
        color: 'white',
        padding: `${spacing.xl} ${spacing.md}`,
        textAlign: 'center',
      }}>
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
          <SectionHeader title="For Buyers" subtitle="Ordering & Pickup Process" />

          <StepList steps={[
            'Browse products from local vendors',
            'Add items to your cart (minimum $10 order)',
            'Complete checkout with secure payment',
            'Vendor confirms your order and prepares items',
            'You receive notification when items are ready for pickup',
            'Visit the market on pickup day',
            'Find the vendor\'s booth and show your order screen',
            'Vendor hands you your items',
            'Both you and vendor confirm the handoff in the app',
          ]} />

          <InfoCard title="The Pickup Confirmation Step" variant="green">
            <p>After the vendor hands you your items:</p>
            <ol style={{ paddingLeft: '1.2rem', margin: `${spacing.xs} 0` }}>
              <li>Tap <strong>"Confirm Receipt"</strong> in your app</li>
              <li>Vendor confirms on their end within 30 seconds</li>
              <li>Both see a green confirmation screen</li>
              <li>Payment transfers to vendor at this point</li>
            </ol>
            <p style={{ fontWeight: typography.weights.semibold, margin: `${spacing.xs} 0 0 0` }}>
              This protects both you and the vendor by ensuring both parties agree the handoff happened.
            </p>
          </InfoCard>

          <InfoCard title="What If Something Goes Wrong?" variant="amber">
            <ul style={{ paddingLeft: '1.2rem', margin: `${spacing.xs} 0` }}>
              <li><strong>Items missing?</strong> Tap "I Did Not Receive This" instead of confirming</li>
              <li><strong>Wrong items?</strong> Work it out with the vendor or report an issue</li>
              <li><strong>Vendor not at market?</strong> Contact support immediately</li>
              <li><strong>Technical issues?</strong> You have 24 hours to resolve with platform support</li>
            </ul>
          </InfoCard>
        </section>

        {/* === FOR VENDORS === */}
        <section id="vendors" style={{ marginBottom: spacing.xl }}>
          <SectionHeader title="For Vendors" subtitle="Order Flow & Pickup Process" />

          <StepList steps={[
            'Receive order notification',
            'Confirm you can fulfill the order',
            'Prepare items before market day',
            'Mark items as "Ready for Pickup" when prepared',
            'Buyer receives notification that items are ready',
            'Buyer arrives at your booth on market day',
            'Verify their order number matches',
            'Hand over all items',
            'When buyer confirms receipt, tap "Yes, I Handed It Off" within 30 seconds',
            'See green confirmation screen — payment is being transferred',
          ]} />

          <InfoCard title="Why Confirmation Matters" variant="green">
            <ul style={{ paddingLeft: '1.2rem', margin: `${spacing.xs} 0` }}>
              <li>Payment doesn&apos;t transfer until <strong>both parties confirm</strong></li>
              <li>If you don&apos;t confirm within 30 seconds, you&apos;ll see an urgent prompt</li>
              <li>After 5 minutes, other actions are blocked until you resolve the pending confirmation</li>
              <li>This protects both you and your customers from disputes</li>
            </ul>
          </InfoCard>

          <InfoCard title="Best Practices" variant="blue">
            <ul style={{ paddingLeft: '1.2rem', margin: `${spacing.xs} 0` }}>
              <li>Stay at your booth during market hours</li>
              <li>Have your phone charged and app open</li>
              <li>Confirm handoffs immediately — don&apos;t wait</li>
              <li>Verify buyer&apos;s order number before handing over items</li>
              <li>If there&apos;s an issue, tap "Report Issue" instead of confirming</li>
            </ul>
          </InfoCard>

          <InfoCard title="Payment Timing" variant="default">
            <ul style={{ paddingLeft: '1.2rem', margin: `${spacing.xs} 0` }}>
              <li>Payment transfers immediately after both parties confirm</li>
              <li>Usually reaches your bank account within 1-2 business days</li>
              <li>You can track order statuses on your vendor dashboard</li>
            </ul>
          </InfoCard>
        </section>

        {/* === PICKUP GUIDE === */}
        <section id="pickup" style={{ marginBottom: spacing.xl }}>
          <SectionHeader title="Pickup Mode Guide" subtitle="Step-by-step for both parties" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: spacing.md }}>
            <div style={cardStyle}>
              <h3 style={{ margin: `0 0 ${spacing.sm} 0`, color: colors.primary, fontSize: typography.sizes.lg }}>
                Buyers
              </h3>
              <ol style={{ paddingLeft: '1.2rem', margin: 0, lineHeight: typography.leading.relaxed }}>
                <li>Open your order in the app</li>
                <li>Show the pickup screen to the vendor</li>
                <li>Verify you received all items</li>
                <li>Tap "Confirm Receipt"</li>
                <li>Wait for vendor to confirm (30 seconds)</li>
                <li>Green screen = you&apos;re done!</li>
                <li><strong>Don&apos;t leave until you see the green screen</strong></li>
              </ol>
            </div>

            <div style={cardStyle}>
              <h3 style={{ margin: `0 0 ${spacing.sm} 0`, color: colors.primary, fontSize: typography.sizes.lg }}>
                Vendors
              </h3>
              <ol style={{ paddingLeft: '1.2rem', margin: 0, lineHeight: typography.leading.relaxed }}>
                <li>Check your dashboard for ready orders</li>
                <li>When buyer arrives, verify order number</li>
                <li>Hand over all items</li>
                <li>Wait for buyer to confirm in their app</li>
                <li>When notified, tap "Yes, I Handed It Off"</li>
                <li>Green screen = payment is processing</li>
                <li><strong>Never let buyer leave without both confirming</strong></li>
              </ol>
            </div>
          </div>
        </section>

        {/* === CANCELLATIONS === */}
        <section id="cancellations" style={{ marginBottom: spacing.xl }}>
          <SectionHeader title="Cancellation Policy" subtitle="What happens when plans change" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: spacing.md }}>
            <InfoCard title="Within 1 Hour" variant="green">
              <p style={{ margin: `${spacing.xs} 0`, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                Free Cancellation
              </p>
              <p style={{ margin: 0 }}>
                Cancel within 1 hour of placing your order for a full refund. No questions asked.
              </p>
            </InfoCard>

            <InfoCard title="After 1 Hour" variant="amber">
              <p style={{ margin: `${spacing.xs} 0`, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold }}>
                25% Cancellation Fee
              </p>
              <p style={{ margin: 0 }}>
                After 1 hour, a 25% fee applies. This compensates the vendor for prep time and reserved items. You receive a 75% refund.
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
              backgroundColor: colors.primary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: radius.md,
              fontWeight: typography.weights.bold,
              fontSize: typography.sizes.lg,
            }}
          >
            Browse Products
          </Link>
        </div>
      </div>
    </div>
  )
}

// === Reusable Sub-Components ===

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: spacing.md }}>
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
      padding: spacing.md,
      backgroundColor: colors.surfaceElevated,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.md,
      marginBottom: spacing.md,
    }}>
      <ol style={{
        paddingLeft: '1.5rem',
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.xs,
      }}>
        {steps.map((step, i) => (
          <li key={i} style={{
            fontSize: typography.sizes.base,
            lineHeight: typography.leading.relaxed,
            color: colors.textSecondary,
          }}>
            {step}
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
    green: { bg: '#f0fdf4', border: '#86efac', titleColor: '#166534' },
    amber: { bg: '#fffbeb', border: '#fcd34d', titleColor: '#92400e' },
    blue: { bg: '#eff6ff', border: '#93c5fd', titleColor: '#1e40af' },
    default: { bg: colors.surfaceElevated, border: colors.border, titleColor: colors.textPrimary },
  }
  const s = variantStyles[variant]

  return (
    <div style={{
      padding: spacing.md,
      backgroundColor: s.bg,
      border: `1px solid ${s.border}`,
      borderRadius: radius.md,
      marginBottom: spacing.sm,
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
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
}
