import TaxReversalsAdminPage from '@/components/admin/TaxReversalsAdminPage'

/**
 * Platform-only sales-tax "reversal owed" queue (owner Q2, built 2026-09-26).
 * Layout: requireAdmin; the API additionally requires platform_admin — a
 * vertical admin who reaches this URL sees the API's 403 message, nothing else.
 * No vertical twin: accounting is platform-admin work (same as the reports
 * page's Accounting group).
 */
export default function AdminTaxReversalsPage() {
  return <TaxReversalsAdminPage />
}
