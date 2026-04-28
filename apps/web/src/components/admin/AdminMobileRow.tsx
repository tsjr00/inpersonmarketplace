import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Compressed row used on mobile (< 640px) inside admin list pages.
 *
 * Two modes — pass exactly one of `href` or `rightAction`:
 *
 *   1. Drill-in mode (`href`):
 *      Whole row is a tap target → navigates to the detail page.
 *      A chevron is shown on the right.
 *      Use for vendors, markets, vendors/pending — anywhere a detail
 *      page exists at `/admin/<entity>/[id]`.
 *
 *   2. Action mode (`rightAction`):
 *      Row body is not tappable; an action element (button, menu, chip)
 *      renders on the right.
 *      Use for listings, users, etc. where actions happen inline (no
 *      dedicated detail page).
 *
 * The desktop table is kept untouched — visibility is toggled via
 * `.admin-list-table` / `.admin-list-mobile` CSS classes defined in
 * `AdminResponsiveStyles.tsx`.
 */
interface AdminMobileRowProps {
  /** Primary identifier shown prominently on line 1 (e.g. business name). */
  title: string
  /** Secondary line (email · tier · vertical etc.). Plain text or React node. */
  secondary: ReactNode
  /** Optional status chip rendered between title and chevron/action. */
  statusBadge?: ReactNode
  /** Drill-in mode: whole row links here. Chevron shown. Mutually exclusive with rightAction. */
  href?: string
  /** Action mode: this element is rendered on the right; row is not tappable. */
  rightAction?: ReactNode
}

export default function AdminMobileRow({
  title,
  secondary,
  statusBadge,
  href,
  rightAction,
}: AdminMobileRowProps) {
  // When the row has a `rightAction` (action mode — Suspend, Reactivate,
  // etc.), use a STACKED layout: title alone on line 1 (full width, no
  // truncation contention with status chip / button), secondary on line 2,
  // status chip + action button on line 3. Without this, title gets squeezed
  // on phones because chip + button reserve 100-120px on the right.
  //
  // For drill-in rows (no rightAction), keep the COMPACT layout: title +
  // status chip + chevron all on line 1. There's no button, so the title
  // gets enough room.
  if (rightAction) {
    const inner = (
      <>
        <div className="admin-mobile-row-title-block">{title}</div>
        <div className="admin-mobile-row-line2">{secondary}</div>
        <div className="admin-mobile-row-bottom">
          {statusBadge ? (
            <span className="admin-mobile-row-status">{statusBadge}</span>
          ) : <span />}
          <span className="admin-mobile-row-action">{rightAction}</span>
        </div>
      </>
    )

    if (href) {
      return (
        <Link href={href} className="admin-mobile-row admin-mobile-row-stacked">
          {inner}
        </Link>
      )
    }

    return (
      <div className="admin-mobile-row admin-mobile-row-stacked">
        {inner}
      </div>
    )
  }

  // Compact layout (drill-in or no action)
  const line1 = (
    <div className="admin-mobile-row-line1">
      <span className="admin-mobile-row-title">{title}</span>
      {statusBadge && (
        <span className="admin-mobile-row-status">{statusBadge}</span>
      )}
      {href && (
        <span className="admin-mobile-row-chevron" aria-hidden="true">›</span>
      )}
    </div>
  )

  const line2 = <div className="admin-mobile-row-line2">{secondary}</div>

  if (href) {
    return (
      <Link href={href} className="admin-mobile-row">
        {line1}
        {line2}
      </Link>
    )
  }

  return (
    <div className="admin-mobile-row">
      {line1}
      {line2}
    </div>
  )
}
