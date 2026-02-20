'use client'

import { useEffect } from 'react'
import Footer from '@/components/shared/Footer'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

export default function AboutPage() {
  // Handle scroll to hash on page load
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const id = window.location.hash.slice(1)
      const element = document.getElementById(id)
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' })
        }, 100)
      }
    }
  }, [])


  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${colors.border}`,
        backgroundColor: colors.surfaceElevated
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Link href="/" style={{ fontSize: 20, fontWeight: 700, color: colors.textPrimary, textDecoration: 'none' }}>
            815 Enterprises
          </Link>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
        <h1 style={{ fontSize: typography.sizes['3xl'], fontWeight: typography.weights.bold, marginBottom: spacing.lg, color: colors.textPrimary }}>
          About Us
        </h1>

        <div style={{ color: colors.textSecondary, fontSize: typography.sizes.base, lineHeight: typography.leading.relaxed }}>
          {/* Mission Section */}
          <section style={{ marginBottom: spacing.xl }}>
            <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, marginBottom: spacing.md, color: colors.textPrimary }}>
              Our Mission
            </h2>
            <p style={{ marginBottom: spacing.md }}>
              We believe in the power of local communities and the importance of connecting people
              with the vendors and businesses that serve them right in their own neighborhoods.
            </p>
            <p style={{ marginBottom: spacing.md }}>
              Our marketplace platforms were created to make it easier for customers to discover and pre-order
              from their favorite local vendors, while helping vendors manage their business more efficiently
              and reach more customers.
            </p>
          </section>

          {/* How It Works Section */}
          <section style={{ marginBottom: spacing.xl }}>
            <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, marginBottom: spacing.md, color: colors.textPrimary }}>
              What We Do
            </h2>
            <p style={{ marginBottom: spacing.md }}>
              Our platforms connect local vendors and businesses with customers at markets,
              events, and community venues. We make it easy to:
            </p>
            <ul style={{ marginBottom: spacing.md, paddingLeft: spacing.lg }}>
              <li style={{ marginBottom: spacing.xs }}>Discover local vendors and markets in your area</li>
              <li style={{ marginBottom: spacing.xs }}>Pre-order online with guaranteed availability</li>
              <li style={{ marginBottom: spacing.xs }}>Pick up your order at the market or event</li>
              <li style={{ marginBottom: spacing.xs }}>Support small businesses and local vendors directly</li>
            </ul>
          </section>

          {/* For Vendors Section */}
          <section id="vendor-faq" style={{ marginBottom: spacing.xl }}>
            <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, marginBottom: spacing.md, color: colors.textPrimary }}>
              For Vendors
            </h2>
            <p style={{ marginBottom: spacing.md }}>
              We help vendors streamline their market day operations:
            </p>
            <ul style={{ marginBottom: spacing.md, paddingLeft: spacing.lg }}>
              <li style={{ marginBottom: spacing.xs }}>Pre-sell products to know exactly what to bring</li>
              <li style={{ marginBottom: spacing.xs }}>Accept credit cards with fees already built in</li>
              <li style={{ marginBottom: spacing.xs }}>Build a loyal following of repeat customers</li>
              <li style={{ marginBottom: spacing.xs }}>Get discovered by new shoppers in your area</li>
            </ul>
            <p style={{ marginBottom: spacing.md }}>
              Interested in becoming a vendor? Visit our{' '}
              <Link href="/" style={{ color: colors.primary }}>
                homepage
              </Link>
              {' '}and choose a marketplace to get started.
            </p>
          </section>

          {/* Contact Section */}
          <section id="contact" style={{ marginBottom: spacing.xl, paddingTop: spacing.lg }}>
            <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, marginBottom: spacing.md, color: colors.textPrimary }}>
              Contact Us
            </h2>
            <p style={{ marginBottom: spacing.lg }}>
              Have questions, feedback, or need support? We&apos;d love to hear from you.
            </p>

            <div style={{
              backgroundColor: colors.surfaceSubtle,
              padding: spacing.lg,
              borderRadius: radius.lg,
              border: `1px solid ${colors.border}`
            }}>
              <div style={{ marginBottom: spacing.md }}>
                <p style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.medium, color: colors.textPrimary, marginBottom: spacing.xs }}>
                  Email Us
                </p>
                <a
                  href="mailto:support@815enterprises.com"
                  style={{ fontSize: typography.sizes.lg, color: colors.primary, textDecoration: 'none' }}
                >
                  support@815enterprises.com
                </a>
              </div>

              <div>
                <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>
                  We typically respond within 1-2 business days.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
