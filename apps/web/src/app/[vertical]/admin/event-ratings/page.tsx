import EventRatingsAdminPage from '@/components/admin/EventRatingsAdminPage'

/**
 * Vertical event-ratings route — thin wrapper over the shared
 * EventRatingsAdminPage (admin UI rebuild phase 3, merge 6/11, owner
 * 2026-08-31). Auth unchanged: vertical layout hasAdminRole; the API scopes
 * GET by vertical and keeps PATCH platform-admin-only, so this view is
 * read-only with the pointer to the platform panel — exactly as before.
 */
export default async function VerticalEventRatingsPage({
  params,
}: {
  params: Promise<{ vertical: string }>
}) {
  const { vertical } = await params
  return <EventRatingsAdminPage vertical={vertical} />
}
