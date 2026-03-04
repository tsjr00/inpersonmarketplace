'use client'

import { useEffect } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { resolvePlaceholders, verticalPlaceholders } from '@/lib/legal'
import type { LegalDocument as LegalDocumentType, LegalSection } from '@/lib/legal'

interface Props {
  document: LegalDocumentType
  vertical: string
  showTableOfContents?: boolean
}

export default function LegalDocument({ document: doc, vertical, showTableOfContents = true }: Props) {
  const placeholders = verticalPlaceholders[vertical] || verticalPlaceholders.farmers_market

  const resolve = (text: string) => resolvePlaceholders(text, placeholders)

  // Scroll to hash on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const id = window.location.hash.slice(1)
      const element = document.getElementById(id)
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' })
        }, 100)
      }
    }
  }, [])

  const sectionStyle = {
    marginBottom: spacing.xl,
  }

  const h2Style: React.CSSProperties = {
    fontSize: typography.sizes['2xl'],
    fontWeight: typography.weights.bold,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    color: colors.textPrimary,
    paddingTop: spacing.md,
  }

  const h3Style: React.CSSProperties = {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.textPrimary,
  }

  const pStyle: React.CSSProperties = {
    marginBottom: spacing.md,
    lineHeight: typography.leading.relaxed,
    whiteSpace: 'pre-line',
  }

  const tocLinkStyle: React.CSSProperties = {
    color: colors.primary,
    textDecoration: 'none',
    display: 'block',
    padding: `${spacing['3xs']} 0`,
    lineHeight: typography.leading.relaxed,
  }

  const renderContent = (content: string[]) => {
    return content.map((text, i) => {
      const resolved = resolve(text)
      // Check if the text starts with a bold marker like "**..."
      const isAllCaps = resolved === resolved.toUpperCase() && resolved.length > 20
      return (
        <p key={i} style={{
          ...pStyle,
          ...(isAllCaps ? { fontWeight: typography.weights.bold, fontSize: typography.sizes.sm } : {}),
        }}>
          {renderFormattedText(resolved)}
        </p>
      )
    })
  }

  const renderFormattedText = (text: string) => {
    // Split on bold markers and render
    const parts = text.split(/(\*\*[^*]+\*\*)/)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>
      }
      return <span key={i}>{part}</span>
    })
  }

  const renderSection = (section: LegalSection) => {
    return (
      <section key={section.id} id={section.id} style={sectionStyle}>
        {section.level === 'article' ? (
          <h2 style={h2Style}>{resolve(section.title)}</h2>
        ) : (
          <h3 style={h3Style}>{resolve(section.title)}</h3>
        )}
        {renderContent(section.content)}
        {section.subsections?.map(sub => (
          <div key={sub.id}>
            <h3 style={h3Style}>{resolve(sub.title)}</h3>
            {renderContent(sub.content)}
          </div>
        ))}
      </section>
    )
  }

  return (
    <div style={{ color: colors.textSecondary, fontSize: typography.sizes.base }}>
      {/* Title */}
      <h1 id={doc.type === 'privacy_policy' ? 'privacy-policy' : doc.type} style={{
        fontSize: typography.sizes['3xl'],
        fontWeight: typography.weights.bold,
        marginBottom: spacing.sm,
        color: colors.textPrimary,
      }}>
        {resolve(doc.title)}
      </h1>
      {doc.subtitle && (
        <h2 style={{
          fontSize: typography.sizes.xl,
          fontWeight: typography.weights.semibold,
          marginBottom: spacing.sm,
          color: colors.textSecondary,
        }}>
          {resolve(doc.subtitle)}
        </h2>
      )}
      <p style={{ marginBottom: spacing.lg, color: colors.textMuted, fontSize: typography.sizes.sm }}>
        <em>Last updated: {doc.lastUpdated}</em>
      </p>

      {/* Preamble */}
      {doc.preamble.map((text, i) => (
        <p key={`preamble-${i}`} style={{
          ...pStyle,
          ...(text === text.toUpperCase() && text.length > 20
            ? { fontWeight: typography.weights.bold, fontSize: typography.sizes.sm }
            : {}
          ),
        }}>
          {renderFormattedText(resolve(text))}
        </p>
      ))}

      {/* Table of Contents */}
      {showTableOfContents && (
        <nav style={{
          ...sectionStyle,
          background: colors.surfaceMuted,
          padding: spacing.md,
          borderRadius: radius.md,
          border: `1px solid ${colors.border}`,
          marginTop: spacing.lg,
        }}>
          <h2 style={{
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.bold,
            marginBottom: spacing.sm,
            color: colors.textPrimary,
          }}>
            Table of Contents
          </h2>
          {doc.sections.map(section => (
            <a key={section.id} href={`#${section.id}`} style={tocLinkStyle}>
              {resolve(section.title)}
            </a>
          ))}
        </nav>
      )}

      {/* Articles / Sections */}
      {doc.sections.map(section => renderSection(section))}
    </div>
  )
}
