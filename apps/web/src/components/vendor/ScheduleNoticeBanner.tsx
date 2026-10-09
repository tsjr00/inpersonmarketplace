import { spacing, typography, radius } from '@/lib/design-tokens'

/**
 * The one-line "Saved. This day was not added …" notice a listing save hands
 * to the page it redirects to (?schedule_note=, lib/vendor/listing-schedule-days.ts).
 * Server-safe; renders nothing without a notice. Shown on the vendor's
 * listings list (edit saves) and the listing edit page (create saves).
 */
export default function ScheduleNoticeBanner({ notice }: { notice: string | null | undefined }) {
  const text = (notice || '').trim()
  if (!text) return null
  return (
    <div
      role="status"
      style={{
        margin: `${spacing.xs} 0 ${spacing.sm}`,
        padding: `${spacing['2xs']} ${spacing.sm}`,
        backgroundColor: '#fef3c7',
        border: '1px solid #f59e0b',
        borderRadius: radius.sm,
        color: '#92400e',
        fontSize: typography.sizes.sm,
      }}
    >
      {text}
    </div>
  )
}
