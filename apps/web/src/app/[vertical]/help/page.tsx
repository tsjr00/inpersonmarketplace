import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'

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
      <div style={{ marginBottom: 32 }}>
        <Link
          href={`/${vertical}/dashboard`}
          style={{
            color: '#6b7280',
            textDecoration: 'none',
            fontSize: 14,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          ← Back to Dashboard
        </Link>
        <h1 style={{ color: '#111827', marginBottom: 8, marginTop: 12, fontSize: 28 }}>
          Help & FAQ
        </h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: 15 }}>
          Find answers to common questions about ordering, pickups, and more.
        </p>
      </div>

      {categoryNames.length === 0 ? (
        <div style={{
          padding: 40,
          textAlign: 'center',
          backgroundColor: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: 8,
          color: '#6b7280',
        }}>
          No help articles available yet. Check back soon!
        </div>
      ) : (
        categoryNames.map(category => (
          <div key={category} style={{ marginBottom: 32 }}>
            <h2 style={{
              fontSize: 18,
              fontWeight: 600,
              color: '#1e40af',
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: '2px solid #dbeafe',
            }}>
              {category}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {grouped[category].map(article => (
                <details
                  key={article.id}
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <summary style={{
                    padding: '14px 16px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 15,
                    color: '#374151',
                    listStyle: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    {article.title}
                    <span style={{
                      fontSize: 12,
                      color: '#9ca3af',
                      marginLeft: 12,
                      flexShrink: 0,
                      transition: 'transform 0.2s',
                    }}>
                      ▼
                    </span>
                  </summary>
                  <div style={{
                    padding: '0 16px 16px 16px',
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: '#4b5563',
                    whiteSpace: 'pre-wrap',
                    borderTop: '1px solid #f3f4f6',
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
