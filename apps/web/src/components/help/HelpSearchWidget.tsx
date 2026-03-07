'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface Article {
  id: string
  category: string
  title: string
  body: string
}

interface HelpSearchWidgetProps {
  vertical: string
}

export default function HelpSearchWidget({ vertical }: HelpSearchWidgetProps) {
  const router = useRouter()
  const [articles, setArticles] = useState<Article[]>([])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fetch articles on mount
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('knowledge_articles')
      .select('id, category, title, body')
      .eq('is_published', true)
      .or(`vertical_id.eq.${vertical},vertical_id.is.null`)
      .order('category')
      .order('sort_order')
      .then(({ data }) => {
        if (data) setArticles(data)
      })
  }, [vertical])

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 200)
    return () => clearTimeout(timer)
  }, [query])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Filter articles
  const results = debouncedQuery.length >= 2
    ? articles.filter(a => {
        const q = debouncedQuery.toLowerCase()
        return a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q)
      })
    : []

  const displayResults = results.slice(0, 5)
  const hasMore = results.length > 5

  const handleResultClick = useCallback((article: Article) => {
    setIsOpen(false)
    setQuery('')
    router.push(`/${vertical}/help?q=${encodeURIComponent(debouncedQuery)}&article=${article.id}`)
  }, [router, vertical, debouncedQuery])

  const handleViewAll = useCallback(() => {
    setIsOpen(false)
    router.push(`/${vertical}/help?q=${encodeURIComponent(debouncedQuery)}`)
  }, [router, vertical, debouncedQuery])

  return (
    <div
      ref={containerRef}
      style={{
        padding: spacing.md,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        position: 'relative',
      }}
    >
      <h3 style={{
        marginTop: 0,
        marginBottom: spacing['2xs'],
        fontSize: typography.sizes.lg,
        fontWeight: typography.weights.semibold,
      }}>
        Help & FAQ
      </h3>

      {/* Search input */}
      <div style={{ position: 'relative', marginBottom: spacing.xs }}>
        <input
          type="text"
          placeholder="Search help articles..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => { if (debouncedQuery.length >= 2) setIsOpen(true) }}
          style={{
            width: '100%',
            padding: `${spacing['2xs']} ${spacing.xs}`,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.sm,
            backgroundColor: colors.surfaceBase,
            boxSizing: 'border-box',
          }}
        />

        {/* Dropdown results */}
        {isOpen && debouncedQuery.length >= 2 && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 2,
            backgroundColor: '#ffffff',
            border: `1px solid ${colors.border}`,
            borderRadius: radius.sm,
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
            zIndex: 50,
            maxHeight: 320,
            overflowY: 'auto',
          }}>
            {displayResults.length === 0 ? (
              <div style={{
                padding: spacing.xs,
                fontSize: typography.sizes.sm,
                color: colors.textMuted,
                textAlign: 'center',
              }}>
                No results found.{' '}
                <a
                  href={`/${vertical}/support`}
                  style={{ color: colors.primary, textDecoration: 'underline' }}
                >
                  Contact Support
                </a>
              </div>
            ) : (
              <>
                {displayResults.map(article => (
                  <button
                    key={article.id}
                    onClick={() => handleResultClick(article)}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: `${spacing['2xs']} ${spacing.xs}`,
                      border: 'none',
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      borderBottom: `1px solid ${colors.borderMuted}`,
                    }}
                  >
                    <div style={{
                      fontSize: typography.sizes.sm,
                      fontWeight: typography.weights.semibold,
                      color: colors.textPrimary,
                      marginBottom: 2,
                    }}>
                      {article.title}
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing['3xs'],
                    }}>
                      <span style={{
                        fontSize: '11px',
                        color: colors.primary,
                        fontWeight: typography.weights.medium,
                      }}>
                        {article.category}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        color: colors.textMuted,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        — {article.body.slice(0, 80)}...
                      </span>
                    </div>
                  </button>
                ))}
                {hasMore && (
                  <button
                    onClick={handleViewAll}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: spacing['2xs'],
                      border: 'none',
                      backgroundColor: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'center',
                      fontSize: typography.sizes.sm,
                      fontWeight: typography.weights.semibold,
                      color: colors.primary,
                    }}
                  >
                    View all {results.length} results
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Always-visible links */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
        <a
          href={`/${vertical}/help`}
          style={{
            fontSize: typography.sizes.sm,
            color: colors.textMuted,
            textDecoration: 'none',
          }}
        >
          Browse all Help & FAQ →
        </a>
        <a
          href={`/${vertical}/help/setup`}
          style={{
            fontSize: typography.sizes.sm,
            color: colors.textMuted,
            textDecoration: 'none',
          }}
        >
          Setup Guide →
        </a>
        <a
          href={`/${vertical}/support`}
          style={{
            fontSize: typography.sizes.sm,
            color: colors.textMuted,
            textDecoration: 'none',
          }}
        >
          Contact Support →
        </a>
      </div>

      {/* Hover styles */}
      <style>{`
        div[style*="position: absolute"] button:hover {
          background-color: #f3f4f6 !important;
        }
      `}</style>
    </div>
  )
}
