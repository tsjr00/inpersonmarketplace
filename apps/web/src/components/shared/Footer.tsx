import Link from 'next/link'
import { colors, spacing, typography, containers } from '@/lib/design-tokens'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer
      className="flex justify-center"
      style={{
        marginTop: 'auto',
        padding: `${spacing['2xl']} ${spacing.sm} ${spacing.md}`,
        backgroundColor: colors.surfaceMuted,
        borderTop: `1px solid ${colors.border}`
      }}
    >
      <div style={{ maxWidth: containers.xl, width: '100%' }}>
        {/* Footer Content */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: spacing.xl,
            marginBottom: spacing.lg
          }}
        >
          {/* Company Info */}
          <div>
            <h4 style={{
              marginBottom: spacing.sm,
              fontSize: typography.sizes.lg,
              fontWeight: typography.weights.semibold,
              color: colors.textPrimary
            }}>
              815 Enterprises
            </h4>
            <p style={{
              color: colors.textSecondary,
              fontSize: typography.sizes.sm,
              lineHeight: typography.leading.relaxed,
              margin: 0
            }}>
              Connecting local vendors with their communities through innovative marketplace solutions.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 style={{
              marginBottom: spacing.sm,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              color: colors.textPrimary
            }}>
              Company
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: spacing.xs }}>
                <Link
                  href="/about"
                  style={{
                    color: colors.textSecondary,
                    textDecoration: 'none',
                    fontSize: typography.sizes.sm
                  }}
                >
                  About Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 style={{
              marginBottom: spacing.sm,
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.semibold,
              color: colors.textPrimary
            }}>
              Legal
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: spacing.xs }}>
                <Link
                  href="/terms"
                  style={{
                    color: colors.textSecondary,
                    textDecoration: 'none',
                    fontSize: typography.sizes.sm
                  }}
                >
                  Terms of Service
                </Link>
              </li>
              <li style={{ marginBottom: spacing.xs }}>
                <Link
                  href="/privacy"
                  style={{
                    color: colors.textSecondary,
                    textDecoration: 'none',
                    fontSize: typography.sizes.sm
                  }}
                >
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div
          style={{
            paddingTop: spacing.md,
            borderTop: `1px solid ${colors.border}`,
            textAlign: 'center'
          }}
        >
          <p style={{ color: colors.textMuted, fontSize: typography.sizes.sm, margin: 0 }}>
            © {currentYear} 815 Enterprises. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
