import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { colors, statusColors, spacing, typography, radius } from '@/lib/design-tokens'

export const revalidate = 300 // 5 min cache — content changes infrequently

interface HelpPageProps {
  params: Promise<{ vertical: string }>
}

interface Article {
  id: string
  vertical_id: string | null
  category: string
  title: string
  body: string
  sort_order: number
}

export default async function HelpPage({ params }: HelpPageProps) {
  const { vertical } = await params
  const serviceClient = createServiceClient()

  // Fetch published articles for this vertical + global articles
  const { data: articles } = await serviceClient
    .from('knowledge_articles')
    .select('id, vertical_id, category, title, body, sort_order')
    .eq('is_published', true)
    .or(`vertical_id.eq.${vertical},vertical_id.is.null`)
    .order('category')
    .order('sort_order')

  // Group by category
  const grouped = (articles || []).reduce<Record<string, Article[]>>((acc, article) => {
    if (!acc[article.category]) acc[article.category] = []
    acc[article.category].push(article)
    return acc
  }, {})

  const categoryNames = Object.keys(grouped).sort()

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ marginBottom: spacing.lg }}>
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
        <h1 style={{ color: statusColors.neutral900, marginBottom: spacing['2xs'], marginTop: spacing.xs, fontSize: typography.sizes['2xl'] }}>
          Help & FAQ
        </h1>
        <p style={{ color: statusColors.neutral500, margin: 0, fontSize: typography.sizes.sm }}>
          Find answers to common questions about ordering, pickups, and more.
        </p>
      </div>

      {categoryNames.length === 0 ? (
        <div style={{
          padding: spacing.xl,
          textAlign: 'center',
          backgroundColor: statusColors.neutral50,
          border: `1px dashed ${statusColors.neutral300}`,
          borderRadius: radius.md,
          color: statusColors.neutral500,
        }}>
          No help articles available yet. Check back soon!
        </div>
      ) : (
        categoryNames.map(category => (
          <div key={category} style={{ marginBottom: spacing.lg }}>
            <h2 style={{
              fontSize: typography.sizes.lg,
              fontWeight: typography.weights.semibold,
              color: statusColors.infoDark,
              marginBottom: spacing.xs,
              paddingBottom: spacing['2xs'],
              borderBottom: `2px solid ${statusColors.infoBorder}`,
            }}>
              {category}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
              {grouped[category].map(article => (
                <details
                  key={article.id}
                  style={{
                    backgroundColor: 'white',
                    border: `1px solid ${statusColors.neutral200}`,
                    borderRadius: radius.md,
                    overflow: 'hidden',
                  }}
                >
                  <summary style={{
                    padding: `${spacing.xs} ${spacing.sm}`,
                    cursor: 'pointer',
                    fontWeight: typography.weights.semibold,
                    fontSize: typography.sizes.sm,
                    color: statusColors.neutral700,
                    listStyle: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    {article.title}
                    <span style={{
                      fontSize: typography.sizes.xs,
                      color: statusColors.neutral400,
                      marginLeft: spacing.xs,
                      flexShrink: 0,
                      transition: 'transform 0.2s',
                    }}>
                      ▼
                    </span>
                  </summary>
                  <div style={{
                    padding: `0 ${spacing.sm} ${spacing.sm} ${spacing.sm}`,
                    fontSize: typography.sizes.sm,
                    lineHeight: typography.leading.relaxed,
                    color: statusColors.neutral600,
                    whiteSpace: 'pre-wrap',
                    borderTop: `1px solid ${statusColors.neutral100}`,
                  }}>
                    {article.body}
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
