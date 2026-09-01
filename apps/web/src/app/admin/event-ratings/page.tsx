import EventRatingsAdminPage from '@/components/admin/EventRatingsAdminPage'

/**
 * Platform event-ratings route — thin wrapper over the shared
 * EventRatingsAdminPage (admin UI rebuild phase 3, merge 6/11, owner
 * 2026-08-31). Auth unchanged: layout requireAdmin; the API enforces
 * verifyAdminScope on GET and platform-admin-only on PATCH (ADM-4).
 * No vertical prop = platform view with moderation buttons.
 */
export default function EventRatingsModerationPage() {
  return <EventRatingsAdminPage />
}
