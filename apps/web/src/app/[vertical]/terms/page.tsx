'use client'

import { useParams } from 'next/navigation'
import { spacing, colors, typography } from '@/lib/design-tokens'
import LegalDocument from '@/components/legal/LegalDocument'
import { getPlatformUserAgreement, getPrivacyPolicy } from '@/lib/legal'

export default function TermsPage() {
  const { vertical } = useParams<{ vertical: string }>()

  const agreement = getPlatformUserAgreement()
  const privacy = getPrivacyPolicy()

  return (
    <main style={{ maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
      <LegalDocument document={agreement} vertical={vertical} />

      <hr style={{
        border: 'none',
        borderTop: `1px solid ${colors.border}`,
        margin: `${spacing.xl} 0`,
      }} />

      <LegalDocument document={privacy} vertical={vertical} />

      <div style={{
        marginTop: spacing.xl,
        padding: spacing.md,
        backgroundColor: colors.surfaceMuted,
        borderRadius: '8px',
        fontSize: typography.sizes.sm,
        color: colors.textMuted,
      }}>
        <p style={{ margin: 0 }}>
          These terms were last reviewed in March 2026. For questions, contact us through the support page.
        </p>
      </div>
    </main>
  )
}
