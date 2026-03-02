'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import { defaultBranding } from '@/lib/branding/defaults'
import { organizationJsonLd, breadcrumbJsonLd } from '@/lib/marketing/json-ld'

export default function AboutPage() {
  const { vertical } = useParams<{ vertical: string }>()
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const baseUrl = `https://${branding.domain}`

  const isFT = vertical === 'food_trucks'
  const texasCities = ['Dallas', 'Fort Worth', 'Houston', 'Austin', 'San Antonio', 'El Paso']
  const orgSchema = organizationJsonLd({
    name: branding.brand_name,
    url: baseUrl,
    description: isFT
      ? 'Mobile food ordering platform connecting customers with local food trucks. Pre-order tacos, BBQ, pizza, burgers, and more — skip the line and pick up hot and ready.'
      : 'Online ordering platform connecting shoppers with local farmers market vendors and cottage food producers. Pre-order fresh produce, baked goods, honey, jams, and artisan products for market pickup.',
    areaServed: texasCities.map(city => `${city}, Texas`),
  })

  const breadcrumbs = breadcrumbJsonLd([
    { name: 'Home', url: `${baseUrl}/${vertical}` },
    { name: 'About Us', url: `${baseUrl}/${vertical}/about` },
  ])

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
    <main style={{ maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
      <h1 style={{ fontSize: typography.sizes['3xl'], fontWeight: typography.weights.bold, marginBottom: spacing.lg, color: colors.textPrimary }}>
        About {branding.brand_name}
      </h1>

      <div style={{ color: colors.textSecondary, fontSize: typography.sizes.base, lineHeight: typography.leading.relaxed }}>
        {/* Mission Section */}
        <section style={{ marginBottom: spacing.xl }}>
          <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, marginBottom: spacing.md, color: colors.textPrimary }}>
            Our Mission
          </h2>
          <p style={{ marginBottom: spacing.md }}>
            We believe in the power of local communities and the importance of connecting people
            with the {term(vertical, 'vendor_people')} that serve them right in their own neighborhoods.
            {branding.brand_name} is a farm to table marketplace and local food platform that bridges
            the gap between {term(vertical, 'vendors').toLowerCase()} and their community.
          </p>
          <p style={{ marginBottom: spacing.md }}>
            {term(vertical, 'display_name')} was created to make it easier for customers to discover, pre-order
            online, and pick up from their favorite local {term(vertical, 'vendors').toLowerCase()} — while
            helping {term(vertical, 'vendors').toLowerCase()} manage their business more efficiently
            and reach more customers. Whether you&apos;re looking for {term(vertical, 'product_examples')},
            our platform connects you with verified local {term(vertical, 'vendors').toLowerCase()} near you.
          </p>
          {!isFT && (
            <p style={{ marginBottom: spacing.md }}>
              We&apos;re especially proud to support cottage food producers, home bakers, and small-batch
              artisans selling under cottage food law. Our platform gives home-based food sellers the same
              professional online ordering tools that larger operations use — making it easy to list products,
              accept pre-orders, and connect with local buyers.
            </p>
          )}
        </section>

        {/* How It Works Section */}
        <section style={{ marginBottom: spacing.xl }}>
          <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, marginBottom: spacing.md, color: colors.textPrimary }}>
            What We Do
          </h2>
          <p style={{ marginBottom: spacing.md }}>
            We connect local {term(vertical, 'vendors').toLowerCase()} with customers at {term(vertical, 'markets').toLowerCase()},
            events, and community venues. Our online ordering platform makes it easy to:
          </p>
          <ul style={{ marginBottom: spacing.md, paddingLeft: spacing.lg }}>
            <li style={{ marginBottom: spacing.xs }}>Find {term(vertical, 'vendors').toLowerCase()} and {term(vertical, 'markets').toLowerCase()} near you</li>
            <li style={{ marginBottom: spacing.xs }}>Pre-order {term(vertical, 'products').toLowerCase()} online with guaranteed availability</li>
            <li style={{ marginBottom: spacing.xs }}>Pick up your order at the {term(vertical, 'market').toLowerCase()} — skip the line on arrival</li>
            <li style={{ marginBottom: spacing.xs }}>Subscribe to {term(vertical, 'market_boxes')} for curated weekly bundles</li>
            <li style={{ marginBottom: spacing.xs }}>Support small businesses and local {term(vertical, 'vendors').toLowerCase()} directly</li>
          </ul>
        </section>

        {/* For Vendors Section */}
        <section id="vendor-faq" style={{ marginBottom: spacing.xl }}>
          <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, marginBottom: spacing.md, color: colors.textPrimary }}>
            For {term(vertical, 'vendors')}
          </h2>
          <p style={{ marginBottom: spacing.md }}>
            We help {term(vertical, 'vendors').toLowerCase()} streamline their {term(vertical, 'market_day').toLowerCase()} operations:
          </p>
          <ul style={{ marginBottom: spacing.md, paddingLeft: spacing.lg }}>
            <li style={{ marginBottom: spacing.xs }}>Pre-sell {term(vertical, 'products').toLowerCase()} to know exactly what to bring</li>
            <li style={{ marginBottom: spacing.xs }}>Accept credit cards with fees already built in</li>
            <li style={{ marginBottom: spacing.xs }}>Build a loyal following of repeat customers</li>
            <li style={{ marginBottom: spacing.xs }}>Get discovered by new shoppers in your area</li>
          </ul>
          <p style={{ marginBottom: spacing.md }}>
            Interested in becoming a {term(vertical, 'vendor').toLowerCase()}?{' '}
            <Link href={`/${vertical}/vendor-signup`} style={{ color: colors.primary }}>
              Sign up here
            </Link>
            {' '}to get started.
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
                Submit a Support Request
              </p>
              <Link
                href={`/${vertical}/support`}
                style={{ fontSize: typography.sizes.lg, color: colors.primary, textDecoration: 'none' }}
              >
                Contact Support
              </Link>
            </div>

            <div>
              <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted }}>
                We typically respond within 24-48 hours.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
