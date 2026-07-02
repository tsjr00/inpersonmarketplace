import LocationLogView from '@/components/vendor/LocationLogView'

/**
 * FT compliance "location log" page (P3b). Thin server shell — the client
 * component fetches the authenticated vendor's own check-in history from
 * /api/vendor/checkins/log and renders a table + CSV export.
 */
export default async function VendorLocationLogPage({
  params,
}: {
  params: Promise<{ vertical: string }>
}) {
  const { vertical } = await params
  return <LocationLogView vertical={vertical} />
}
