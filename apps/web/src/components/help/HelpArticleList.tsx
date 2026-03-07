'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { statusColors, spacing, typography, radius } from '@/lib/design-tokens'

interface Article {
  id: string
  vertical_id: string | null
  category: string
  title: string
  body: string
  sort_order: number
}

interface HelpArticleListProps {
  articles: Article[]
  initialQuery?: string
  initialArticleId?: string
}

export default function HelpArticleList({
  articles,
  initialQuery = '',
  initialArticleId,
}: HelpArticleListProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery)
  const articleRefs = useRef<Map<string, HTMLDetailsElement>>(new Map())
  const scrolledRef = useRef(false)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200)
    return () => clearTimeout(timer)
  }, [query])

  // Update URL when search changes (without navigation)
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (debouncedQuery) {
      params.set('q', debouncedQuery)
    } else {
      params.delete('q')
    }
    params.delete('article') // Clear article param after initial scroll
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname
    router.replace(newUrl, { scroll: false })
  }, [debouncedQuery, pathname, router, searchParams])

  // Auto-scroll to specific article on mount
  useEffect(() => {
    if (initialArticleId && !scrolledRef.current) {
      scrolledRef.current = true
      // Small delay to let DOM render
      setTimeout(() => {
        const el = articleRefs.current.get(initialArticleId)
        if (el) {
          el.open = true
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
    }
  }, [initialArticleId])

  const isSearching = debouncedQuery.length >= 2

  // Filter articles
  const filtered = isSearching
    ? articles.filter(a => {
        const q = debouncedQuery.toLowerCase()
        return a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q)
      })
    : articles

  // Group by category (for non-search view)
  const grouped = filtered.reduce<Record<string, Article[]>>((acc, article) => {
    if (!acc[article.category]) acc[article.category] = []
    acc[article.category].push(article)
    return acc
  }, {})
  const categoryNames = Object.keys(grouped).sort()

  const renderArticle = (article: Article, autoOpen: boolean) => (
    <details
      key={article.id}
      ref={(el) => {
        if (el) articleRefs.current.set(article.id, el)
      }}
      open={autoOpen}
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
        <span style={{ flex: 1 }}>
          {article.title}
          {isSearching && (
            <span style={{
              marginLeft: spacing['2xs'],
              fontSize: '11px',
              color: statusColors.neutral400,
              fontWeight: typography.weights.medium as number,
            }}>
              {article.category}
            </span>
          )}
        </span>
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
  )

  return (
    <div>
      {/* Search input */}
      <div style={{ marginBottom: spacing.md }}>
        <input
          type="text"
          placeholder="Search help articles..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            padding: `${spacing.xs} ${spacing.sm}`,
            border: `1px solid ${statusColors.neutral200}`,
            borderRadius: radius.md,
            fontSize: typography.sizes.base,
            backgroundColor: 'white',
            boxSizing: 'border-box',
          }}
        />
        {isSearching && (
          <p style={{
            margin: `${spacing['2xs']} 0 0 0`,
            fontSize: typography.sizes.sm,
            color: statusColors.neutral500,
          }}>
            Showing {filtered.length} of {articles.length} articles
          </p>
        )}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div style={{
          padding: spacing.xl,
          textAlign: 'center',
          backgroundColor: statusColors.neutral50,
          border: `1px dashed ${statusColors.neutral300}`,
          borderRadius: radius.md,
          color: statusColors.neutral500,
        }}>
          No articles match your search. Try different keywords.
        </div>
      ) : isSearching ? (
        // Flat list when searching — all auto-expanded
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing['2xs'] }}>
          {filtered.map(article => renderArticle(article, true))}
        </div>
      ) : (
        // Category-grouped view (default)
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
              {grouped[category].map(article =>
                renderArticle(article, article.id === initialArticleId)
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
