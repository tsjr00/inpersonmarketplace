import { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { statusColors, spacing, typography, radius } from '@/lib/design-tokens'
import { defaultBranding } from '@/lib/branding'
import { faqPageJsonLd, breadcrumbJsonLd } from '@/lib/marketing/json-ld'
import HelpArticleList from '@/components/help/HelpArticleList'

export const revalidate = 300 // 5 min cache — content changes infrequently

interface HelpPageProps {
  params: Promise<{ vertical: string }>
  searchParams: Promise<{ q?: string; article?: string }>
}

export async function generateMetadata({ params }: HelpPageProps): Promise<Metadata> {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const isFT = vertical === 'food_trucks'

  return {
    title: `Help & FAQ | ${branding.brand_name}`,
    description: isFT
      ? 'Get answers about ordering from food trucks online, skip-the-line pickup, Chef Box subscriptions, and food truck operator support. Frequently asked questions for food truck customers and vendors.'
      : 'Get answers about ordering from farmers markets online, market pickup, Market Box subscriptions, and vendor support. Frequently asked questions for farmers market shoppers and vendors.',
  }
}

export default async function HelpPage({ params, searchParams }: HelpPageProps) {
  const { vertical } = await params
  const { q, article: articleId } = await searchParams
  const serviceClient = createServiceClient()

  // Fetch published articles for this vertical + global articles
  const { data: articles } = await serviceClient
    .from('knowledge_articles')
    .select('id, vertical_id, category, title, body, sort_order')
    .eq('is_published', true)
    .or(`vertical_id.eq.${vertical},vertical_id.is.null`)
    .order('category')
    .order('sort_order')

  const allArticles = articles || []
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const baseUrl = `https://${branding.domain}`

  // Build FAQ structured data from articles
  const faqSchema = allArticles.length > 0
    ? faqPageJsonLd(allArticles.map(a => ({ question: a.title, answer: a.body })))
    : null

  const breadcrumbs = breadcrumbJsonLd([
    { name: 'Home', url: `${baseUrl}/${vertical}` },
    { name: 'Help & FAQ', url: `${baseUrl}/${vertical}/help` },
  ])

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px' }}>
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
      <div style={{ marginBottom: spacing.lg }}>
        <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
          <Link
            href={`/${vertical}/dashboard`}
            style={{
              color: statusColors.neutral500,
              textDecoration: 'none',
              fontSize: typography.sizes.sm,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            ← Back to Dashboard
          </Link>
          <span style={{ color: statusColors.neutral300 }}>|</span>
          <Link
            href={`/${vertical}/browse`}
            style={{
              color: statusColors.neutral500,
              textDecoration: 'none',
              fontSize: typography.sizes.sm,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            ← Browse
          </Link>
        </div>
        <h1 style={{ color: statusColors.neutral900, marginBottom: spacing['2xs'], marginTop: spacing.xs, fontSize: typography.sizes['2xl'] }}>
          Help & FAQ
        </h1>
        <p style={{ color: statusColors.neutral500, margin: 0, fontSize: typography.sizes.sm }}>
          Find answers to common questions about ordering, pickups, and more.
        </p>
      </div>

      {/* Support link */}
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
          Can&apos;t find what you&apos;re looking for?{' '}
          <Link
            href={`/${vertical}/support`}
            style={{ color: statusColors.infoDark, fontWeight: 600 }}
          >
            Contact Support
          </Link>{' '}
          and we&apos;ll get back to you within 24-48 hours.
        </p>
      </div>

      {/* Setup Guide Link */}
      <Link
        href={`/${vertical}/help/setup`}
        style={{
          display: 'block',
          marginBottom: spacing.lg,
          padding: spacing.sm,
          backgroundColor: statusColors.infoLight,
          border: `1px solid ${statusColors.infoBorder}`,
          borderRadius: radius.md,
          textDecoration: 'none',
        }}
      >
        <p style={{ margin: 0, fontSize: typography.sizes.sm, color: statusColors.infoDark, fontWeight: 600 }}>
          Setup Guide: Enable Notifications &amp; Install the App →
        </p>
        <p style={{ margin: `${spacing['3xs']} 0 0 0`, fontSize: typography.sizes.xs, color: statusColors.neutral600 }}>
          Step-by-step instructions for all browsers and devices.
        </p>
      </Link>

      {/* Searchable Article List */}
      <HelpArticleList
        articles={allArticles}
        initialQuery={q}
        initialArticleId={articleId}
      />
    </div>
  )
}
