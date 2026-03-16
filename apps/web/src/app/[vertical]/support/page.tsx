import Link from 'next/link'
import { SupportForm } from '@/components/support/SupportForm'
import { statusColors, spacing, typography, radius } from '@/lib/design-tokens'
import { getLocale } from '@/lib/locale/server'
import { t } from '@/lib/locale/messages'

interface SupportPageProps {
  params: Promise<{ vertical: string }>
}

export default async function SupportPage({ params }: SupportPageProps) {
  const { vertical } = await params
  const locale = await getLocale()

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: spacing.lg }}>
        <Link
          href={`/${vertical}/help`}
          style={{
            color: statusColors.neutral500,
            textDecoration: 'none',
            fontSize: typography.sizes.sm,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {t('support.back', locale)}
        </Link>
        <h1
          style={{
            color: statusColors.neutral900,
            marginBottom: spacing['2xs'],
            marginTop: spacing.xs,
            fontSize: typography.sizes['2xl'],
          }}
        >
          {t('support.title', locale)}
        </h1>
        <p
          style={{
            color: statusColors.neutral500,
            margin: 0,
            fontSize: typography.sizes.sm,
            lineHeight: 1.5,
          }}
        >
          {t('support.desc', locale)}
        </p>
      </div>

      {/* Quick links */}
      <div
        style={{
          marginBottom: spacing.lg,
          padding: spacing.sm,
          backgroundColor: statusColors.neutral50,
          border: `1px solid ${statusColors.neutral200}`,
          borderRadius: radius.md,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: typography.sizes.sm,
            color: statusColors.neutral600,
          }}
        >
          {t('support.quick_answers', locale)}{' '}
          <Link
            href={`/${vertical}/help`}
            style={{ color: statusColors.infoDark, fontWeight: 600 }}
          >
            {t('support.help_faq', locale)}
          </Link>{' '}
          {t('support.quick_answers_suffix', locale)}
        </p>
      </div>

      {/* Support form */}
      <SupportForm vertical={vertical} />
    </div>
  )
}
