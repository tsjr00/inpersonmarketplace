'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { spacing, colors, typography, radius } from '@/lib/design-tokens'
import LegalDocument from '@/components/legal/LegalDocument'
import { getVendorPartnerAgreement } from '@/lib/legal'

export default function PartnerTermsPage() {
  const { vertical } = useParams<{ vertical: string }>()

  const agreement = getVendorPartnerAgreement()

  return (
    <main style={{ maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
      <div style={{
        marginBottom: spacing.lg,
        padding: spacing.sm,
        backgroundColor: '#fef3cd',
        borderRadius: radius.md,
        border: '1px solid #ffc107',
        fontSize: typography.sizes.sm,
        color: '#856404',
      }}>
        <p style={{ margin: `0 0 ${spacing['2xs']} 0`, fontWeight: typography.weights.semibold }}>
          Confidential Agreement
        </p>
        <p style={{ margin: 0 }}>
          This Vendor Partner Agreement contains confidentiality, non-disclosure, non-competition, and trade secret provisions.
          It supplements the{' '}
          <Link href={`/${vertical}/terms`} style={{ color: '#856404', fontWeight: typography.weights.medium }}>
            Platform User Agreement
          </Link>
          {' '}and the{' '}
          <Link href={`/${vertical}/terms/vendor`} style={{ color: '#856404', fontWeight: typography.weights.medium }}>
            Vendor Service Agreement
          </Link>.
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
