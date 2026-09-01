import AnalyticsAdminPage from '@/components/admin/AnalyticsAdminPage'

/**
 * Platform analytics route — thin wrapper over the shared AnalyticsAdminPage
 * (admin UI rebuild phase 3, merge 8/11, owner 2026-08-31). ⚠ money-adjacent:
 * no API or figure changed in the merge. Auth unchanged: the component keeps
 * the same client-side admin check + the three analytics APIs enforce
 * verifyAdminForApi. No vertical prop = cross-vertical view.
 */
export default function AdminAnalyticsPage() {
  return <AnalyticsAdminPage />
}
