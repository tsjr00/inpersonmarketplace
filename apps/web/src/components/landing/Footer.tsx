'use client'

import Link from 'next/link'
import Image from 'next/image'
import { spacing, typography, getVerticalColors } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'
import { DottedSeparator } from './DottedSeparator'

interface FooterProps {
  vertical: string
}

/**
 * Footer Section
 * FM: Dark green background, text-only brand column, 4-column layout
 * FT: Dark charcoal background, logo+tagline side by side at top, link columns below
 */
export function Footer({ vertical }: FooterProps) {
  const colors = getVerticalColors(vertical)
  const currentYear = new Date().getFullYear()
  const isFT = vertical === 'food_trucks'

  // FT uses dark charcoal (not pure black). FM uses textPrimary (dark green).
  const footerBg = isFT ? '#333333' : colors.textPrimary

  const footerSections = [
    {
      title: 'For Shoppers',
      links: [
        { label: `Browse ${term(vertical, 'markets')}`, href: `/${vertical}/markets` },
        { label: term(vertical, 'browse_products_cta'), href: `/${vertical}/browse` },
        { label: 'Features & Benefits', href: `/${vertical}/features` },
        { label: 'How It Works', href: `/${vertical}/how-it-works` },
        { label: 'Sign Up', href: `/${vertical}/signup` },
      ]
    },
    {
      title: 'For Vendors',
      links: [
        { label: 'Become a Vendor', href: `/${vertical}/vendor-signup` },
        { label: 'Why Sell With Us', href: `/${vertical}/features#vendors` },
        { label: 'Vendor FAQ', href: `/about#vendor-faq` },
      ]
    },
    {
      title: 'Company',
      links: [
        { label: 'About Us', href: '/about' },
        { label: 'Contact Us', href: '/about#contact' },
        { label: 'Privacy Policy', href: '/terms#privacy-policy' },
        { label: 'Terms of Service', href: '/terms' },
      ]
    }
  ]

  // FT: Two-row layout — logo+tagline on top, link columns below
  if (isFT) {
    return (
      <footer
        className="flex justify-center"
        style={{
          backgroundColor: footerBg,
          paddingTop: spacing.xl,
          paddingBottom: spacing.md,
        }}
      >
        <div className="landing-container">
          {/* Row 1: Logo + Tagline side by side */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.md,
              marginBottom: spacing.lg,
            }}
          >
            {/* Logo with circular clip to hide white background */}
            <div style={{
              width: 70,
              height: 70,
              borderRadius: '50%',
              overflow: 'hidden',
              flexShrink: 0,
              backgroundColor: footerBg,
            }}>
              <Image
                src="/logos/food-truckn-logo.png"
                alt="Food Truck'n"
                width={70}
                height={70}
                style={{ objectFit: 'cover' }}
              />
            </div>
            {/* Tagline text — 3 lines, middle centered with logo */}
            <div
              style={{
                fontSize: typography.sizes.sm,
                color: colors.accentMuted,
                lineHeight: typography.leading.relaxed,
              }}
            >
              <div>Connecting neighbors</div>
              <div>with local food truck</div>
              <div>operators and chefs.</div>
            </div>
          </div>

          {/* Row 2: Link columns — all 3 side by side */}
          <div
            className="grid grid-cols-3"
            style={{ gap: spacing.md, marginBottom: spacing.lg }}
          >
            {footerSections.map((section, index) => (
              <div key={index}>
                <h4
                  style={{
                    fontSize: typography.sizes.sm,
                    fontWeight: typography.weights.semibold,
                    color: colors.surfaceSubtle,
                    marginBottom: spacing.sm,
                  }}
                >
                  {section.title}
                </h4>
                <ul style={{ listStyle: 'none' }}>
                  {section.links.map((link, linkIndex) => (
                    <li key={linkIndex} style={{ marginBottom: spacing['2xs'] }}>
                      <Link
                        href={link.href}
                        className="transition-colors"
                        style={{
                          fontSize: typography.sizes.xs,
                          color: colors.accentMuted,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = colors.primary
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = colors.accentMuted
                        }}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Dotted separator */}
          <DottedSeparator color="rgba(255,255,255,0.2)" />

          {/* Copyright */}
          <div style={{ paddingTop: spacing.md }}>
            <p
              className="text-center"
              style={{
                fontSize: typography.sizes.sm,
                color: colors.accentMuted,
              }}
            >
              &copy; {currentYear} {term(vertical, 'display_name')}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    )
  }

  // FM: Original 4-column layout (brand + 3 link columns)
  return (
    <footer
      className="flex justify-center"
      style={{
        backgroundColor: footerBg,
        paddingTop: spacing.xl,
        paddingBottom: spacing.md,
      }}
    >
      <div className="landing-container">
        {/* Main Footer Content */}
        <div
          className="grid grid-cols-2 md:grid-cols-4"
          style={{ gap: spacing.lg, marginBottom: spacing.lg }}
        >
          {/* Brand Column */}
          <div className="col-span-2 md:col-span-1">
            <p
              style={{
                fontSize: typography.sizes.sm,
                color: colors.accentMuted,
                lineHeight: typography.leading.relaxed,
              }}
            >
              Connecting neighbors with local {term(vertical, 'vendor_people')}.
            </p>
          </div>

          {/* Link Columns */}
          {footerSections.map((section, index) => (
            <div key={index}>
              <h4
                style={{
                  fontSize: typography.sizes.sm,
                  fontWeight: typography.weights.semibold,
                  color: colors.surfaceSubtle,
                  marginBottom: spacing.sm,
                }}
              >
                {section.title}
              </h4>
              <ul style={{ listStyle: 'none' }}>
                {section.links.map((link, linkIndex) => (
                  <li key={linkIndex} style={{ marginBottom: spacing['2xs'] }}>
                    <Link
                      href={link.href}
                      className="transition-colors"
                      style={{
                        fontSize: typography.sizes.sm,
                        color: colors.accentMuted,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = colors.primary
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = colors.accentMuted
                      }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${colors.textSecondary}` }} />

        {/* Copyright */}
        <div style={{ paddingTop: spacing.md }}>
          <p
            className="text-center"
            style={{
              fontSize: typography.sizes.sm,
              color: colors.accentMuted,
            }}
          >
            &copy; {currentYear} {term(vertical, 'display_name')}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
