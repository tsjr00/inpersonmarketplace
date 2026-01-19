'use client'

import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [20, 50, 100]
}: PaginationProps) {
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = []
    const showPages = 5 // Max pages to show

    if (totalPages <= showPages + 2) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // Always show first page
      pages.push(1)

      if (currentPage > 3) {
        pages.push('ellipsis')
      }

      // Show pages around current
      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)

      for (let i = start; i <= end; i++) {
        pages.push(i)
      }

      if (currentPage < totalPages - 2) {
        pages.push('ellipsis')
      }

      // Always show last page
      pages.push(totalPages)
    }

    return pages
  }

  const buttonStyle = (active: boolean, disabled: boolean) => ({
    padding: `${spacing['2xs']} ${spacing.xs}`,
    minWidth: 36,
    border: `1px solid ${active ? colors.primary : colors.border}`,
    borderRadius: radius.sm,
    backgroundColor: active ? colors.primary : disabled ? colors.surfaceMuted : 'white',
    color: active ? 'white' : disabled ? colors.textMuted : colors.textPrimary,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: typography.sizes.sm,
    fontWeight: active ? typography.weights.semibold : typography.weights.normal,
  })

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: `${spacing.sm} 0`,
      borderTop: `1px solid ${colors.border}`,
      marginTop: spacing.sm,
      flexWrap: 'wrap',
      gap: spacing.sm
    }}>
      {/* Item count */}
      <div style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>
        Showing {startItem}-{endItem} of {totalItems.toLocaleString()}
      </div>

      {/* Page controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
        {/* Previous */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          style={buttonStyle(false, currentPage === 1)}
        >
          ←
        </button>

        {/* Page numbers */}
        {getPageNumbers().map((page, idx) => (
          page === 'ellipsis' ? (
            <span key={`ellipsis-${idx}`} style={{ padding: `0 ${spacing['2xs']}`, color: colors.textMuted }}>
              ...
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              style={buttonStyle(page === currentPage, false)}
            >
              {page}
            </button>
          )
        ))}

        {/* Next */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          style={buttonStyle(false, currentPage === totalPages)}
        >
          →
        </button>
      </div>

      {/* Page size selector */}
      {onPageSizeChange && (
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }}>
          <span style={{ color: colors.textSecondary, fontSize: typography.sizes.sm }}>
            Per page:
          </span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            style={{
              padding: `${spacing['3xs']} ${spacing['2xs']}`,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
              backgroundColor: 'white'
            }}
          >
            {pageSizeOptions.map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

/**
 * Calculate pagination values from total count and current page
 */
export function usePagination(totalItems: number, pageSize: number, currentPage: number) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const offset = (currentPage - 1) * pageSize
  const limit = pageSize

  return {
    totalPages,
    offset,
    limit,
    // Supabase range is inclusive, so we need end = offset + limit - 1
    rangeStart: offset,
    rangeEnd: offset + limit - 1,
  }
}
