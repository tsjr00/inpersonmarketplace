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
  const line1 = (
    <div className="admin-mobile-row-line1">
      <span className="admin-mobile-row-title">{title}</span>
      {statusBadge && (
        <span className="admin-mobile-row-status">{statusBadge}</span>
      )}
      {href && !rightAction && (
        <span className="admin-mobile-row-chevron" aria-hidden="true">›</span>
      )}
      {rightAction && (
        <span className="admin-mobile-row-action">{rightAction}</span>
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
