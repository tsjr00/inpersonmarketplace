'use client'

import { exportToCSV, formatDateForExport } from '@/lib/export-csv'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import type { MarketSurveyRow } from '@/lib/surveys/types'

/**
 * "Download CSV" action for the SurveyResultsCard. Exports the survey rows
 * the (server) card already fetched — no extra route or query, and it works
 * the same on the manager dashboard and the admin market page since it only
 * touches data the page already loaded under its own auth.
 *
 * One row per survey (vendor + buyer), with every rating column; columns for
 * the other audience's categories are simply blank per row.
 */
interface SurveyExportButtonProps {
  rows: MarketSurveyRow[]
}

export default function SurveyExportButton({ rows }: SurveyExportButtonProps) {
  const handleExport = () => {
    exportToCSV(rows, 'survey-results', [
      { key: 'kind', header: 'Audience' },
      { key: 'market_date', header: 'Market Date', getValue: (r) => formatDateForExport(r.market_date) },
      { key: 'submitted', header: 'Submitted', getValue: (r) => (r.submitted_at ? 'Yes' : 'No') },
      { key: 'rating_overall', header: 'Overall' },
      { key: 'rating_foot_traffic', header: 'Foot Traffic' },
      { key: 'rating_sales', header: 'Sales' },
      { key: 'rating_market_organization', header: 'Market Organization' },
      { key: 'rating_manager_support', header: 'Manager Support' },
      { key: 'rating_variety', header: 'Variety' },
      { key: 'rating_quality', header: 'Quality' },
      { key: 'rating_atmosphere', header: 'Atmosphere' },
      { key: 'rating_layout', header: 'Layout' },
      { key: 'rating_accessibility', header: 'Accessibility' },
      { key: 'comment', header: 'Comment' },
      { key: 'submitted_at', header: 'Submitted At', getValue: (r) => formatDateForExport(r.submitted_at) },
    ])
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      style={{
        padding: `${spacing['3xs']} ${spacing.sm}`,
        backgroundColor: 'transparent',
        color: colors.primary,
        border: `1px solid ${colors.primary}`,
        borderRadius: radius.sm,
        fontSize: typography.sizes.xs,
        fontWeight: typography.weights.semibold,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      Download CSV
    </button>
  )
}
