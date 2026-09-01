/**
 * Admin navigation — ONE definition for both tiers (phase 1 of the admin UI
 * rebuild, owner-approved plan 2026-08-30, design in
 * apps/web/.claude/admin_ui_redesign_research.md).
 *
 * Before this, three nav systems coexisted and none was complete: the platform
 * AdminSidebar missed 5 of its own pages, the AdminNav pill row was rendered by
 * only ~8 pages, and the vertical tree had no persistent nav at all — several
 * pages were reachable only by URL. This module is the single source the
 * AdminShell renders and the flow-integrity completeness test reads: every
 * top-level admin page must appear here, so a page can never silently fall out
 * of navigation again.
 *
 * `badgeKey` ties a link to a queue count from lib/admin/queue-badges.ts.
 * Data only — no JSX — so tests can import it cheaply.
 */

export interface AdminNavLink {
  /** Path relative to the tier base (''= the hub). */
  path: string
  label: string
  badgeKey?: import('./queue-badges').AdminBadgeKey
}

export interface AdminNavGroup {
  label: string
  links: AdminNavLink[]
}

/** Vertical tier — base `/${vertical}/admin`. Labels use FT wording; the
 *  shell swaps vertical-specific nouns via term() where needed. */
export const VERTICAL_ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'Operate',
    links: [
      { path: '', label: 'Dashboard' },
      { path: '/events', label: 'Events', badgeKey: 'eventRequests' },
      { path: '/order-issues', label: 'Order Issues', badgeKey: 'orderIssues' },
      { path: '/feedback', label: 'Feedback' },
      { path: '/analytics', label: 'Analytics' },
    ],
  },
  {
    label: 'People & places',
    links: [
      { path: '/vendors', label: 'Vendors', badgeKey: 'pendingVendors' },
      { path: '/markets', label: 'Markets', badgeKey: 'pendingMarkets' },
      { path: '/users', label: 'Users' },
      { path: '/listings', label: 'Listings' },
      { path: '/vendor-activity', label: 'Vendor Activity', badgeKey: 'activityFlags' },
    ],
  },
  {
    label: 'Money',
    links: [
      { path: '/reports', label: 'Reports' },
      { path: '/stripe-reconcile', label: 'Stripe Reconcile' },
      { path: '/cause', label: 'Community Giving' },
    ],
  },
  {
    label: 'Quality',
    links: [
      { path: '/errors', label: 'Error Reports', badgeKey: 'errorReports' },
      { path: '/error-logs', label: 'Error Logs' },
      { path: '/event-ratings', label: 'Event Ratings' },
      { path: '/knowledge', label: 'Knowledge Base' },
    ],
  },
  {
    label: 'System',
    links: [
      { path: '/admins', label: 'Vertical Admins' },
    ],
  },
]

/** Platform tier — base `/admin`. */
export const PLATFORM_ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'Operate',
    links: [
      { path: '', label: 'Dashboard' },
      { path: '/order-issues', label: 'Order Issues', badgeKey: 'orderIssues' },
      { path: '/analytics', label: 'Analytics' },
    ],
  },
  {
    label: 'People & places',
    links: [
      { path: '/vendors', label: 'Vendors' },
      { path: '/vendors/pending', label: 'Pending Vendors', badgeKey: 'pendingVendors' },
      { path: '/markets', label: 'Markets', badgeKey: 'pendingMarkets' },
      { path: '/users', label: 'Users' },
      { path: '/listings', label: 'Listings' },
    ],
  },
  {
    label: 'Money',
    links: [
      { path: '/reports', label: 'Reports' },
      { path: '/cause', label: 'Community Giving', badgeKey: 'causeUnremitted' },
    ],
  },
  {
    label: 'Quality',
    links: [
      { path: '/errors', label: 'Error Reports', badgeKey: 'errorReports' },
      { path: '/error-logs', label: 'Error Logs' },
      { path: '/event-ratings', label: 'Event Ratings' },
    ],
  },
  {
    label: 'System',
    links: [
      { path: '/admins', label: 'Platform Admins' },
      { path: '/mfa/setup', label: 'MFA Setup' },
    ],
  },
]

/**
 * Pages that intentionally do NOT appear in the nav (drill-ins reached from a
 * parent page, or pre-auth flow pages). The completeness test consumes this so
 * every exclusion is a visible decision, not an accident.
 */
export const NAV_EXEMPT_PAGES = [
  '/admin/login',
  '/admin/mfa/verify',
  '/admin/markets/[id]',
  '/[vertical]/admin/markets/[id]',
  '/admin/vendors/[vendorId]',
  '/[vertical]/admin/events/[id]/settlement',
  '/[vertical]/admin/vendors/[vendorId]',
]
