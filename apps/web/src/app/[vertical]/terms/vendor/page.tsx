'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { spacing, colors, typography, radius } from '@/lib/design-tokens'
import LegalDocument from '@/components/legal/LegalDocument'
import { getVendorServiceAgreement } from '@/lib/legal'

export default function VendorTermsPage() {
  const { vertical } = useParams<{ vertical: string }>()

  const agreement = getVendorServiceAgreement()

  return (
    <main style={{ maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
      <div style={{
        marginBottom: spacing.lg,
        padding: spacing.sm,
        backgroundColor: colors.surfaceMuted,
        borderRadius: radius.md,
        border: `1px solid ${colors.border}`,
        fontSize: typography.sizes.sm,
        color: colors.textSecondary,
      }}>
        <p style={{ margin: 0 }}>
          This Vendor Service Agreement supplements the{' '}
          <Link href={`/${vertical}/terms`} style={{ color: colors.primary }}>
            Platform User Agreement
          </Link>
          . All users are also bound by the Platform User Agreement and Privacy Policy.
        </p>
      </div>

      <LegalDocument document={agreement} vertical={vertical} />

      <div style={{
        marginTop: spacing.xl,
        fontSize: typography.sizes.sm,
        color: colors.textMuted,
      }}>
        <Link href={`/${vertical}/terms`} style={{ color: colors.primary }}>
          &larr; Back to Platform User Agreement & Privacy Policy
        </Link>
      </div>
    </main>
  )
}
