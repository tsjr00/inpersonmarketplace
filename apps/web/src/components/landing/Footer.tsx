'use client'

import Link from 'next/link'
import { spacing, typography, getVerticalColors } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'

interface FooterProps {
  vertical: string
}

/**
 * Footer Section
 * Industry standard: Dark background for grounding/closure
 * Uses inverse text, primary color for brand accent
 */
export function Footer({ vertical }: FooterProps) {
  const colors = getVerticalColors(vertical)
  const currentYear = new Date().getFullYear()

  const footerSections = [
    {
      title: 'For Shoppers',
      links: [
        { label: 'Browse Markets', href: `/${vertical}/markets` },
        { label: 'Browse Products', href: `/${vertical}/browse` },
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

  return (
    <footer
      className="flex justify-center"
      style={{
        backgroundColor: colors.textPrimary,
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

        {/* Divider and Copyright */}
        <div
          style={{
            borderTop: `1px solid ${colors.textSecondary}`,
            paddingTop: spacing.md,
          }}
        >
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
