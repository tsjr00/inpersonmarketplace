'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { colors, spacing, typography, radius, statusColors } from '@/lib/design-tokens'
import { DASHBOARD_ICONS } from './icons'
import type { NavDestination } from '@/lib/dashboard/nav-destinations'

/**
 * Switches between the dashboards a user can reach.
 *
 * ⚠ MOBILE-FIRST, and that is not a slogan here — it inverted the design.
 * Owner: "MOST of our users will be on their phone — that is the most important
 * audience." So the PHONE case is the real design and the desktop rail is its
 * roomier variant, not the other way round.
 *
 *   Phone  (< 768px) → fixed BOTTOM TAB BAR. Thumb-reachable, always visible,
 *                      the pattern every consumer app already taught them.
 *                      A hamburger drawer was considered and REJECTED: it hides
 *                      the fact that other sections exist, which is the exact
 *                      confusion to avoid.
 *   Wider  (≥ 768px) → sticky LEFT RAIL.
 *
 * ⚠ RENDERS NOTHING FOR SINGLE-ROLE USERS. Most people are only shoppers; a nav
 * with one destination is pure noise, and screen space is scarcest exactly
 * where most users are. Two or more destinations, or nothing at all.
 *
 * ⚠ The bottom bar reserves space below the page content so the last card is
 * not trapped behind it, and honours `env(safe-area-inset-bottom)` for the
 * iPhone home indicator. That handling is inherited from `shared/MobileNav.tsx`,
 * which had been correct-but-dead since it was written — its only reference was
 * the component gallery. This supersedes it: converted off Tailwind onto the
 * design tokens the rest of the app uses, and fed real role-derived
 * destinations.
 */
export default function DashboardNav({ destinations }: { destinations: NavDestination[] }) {
  const pathname = usePathname() || ''

  // One destination is not a choice. Render nothing.
  if (destinations.length < 2) return null

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      {/* ── PHONE: fixed bottom tab bar ───────────────────────────────── */}
      <nav
        className="dashboard-nav-bar"
        role="navigation"
        aria-label="Dashboard navigation"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          backgroundColor: colors.surfaceElevated,
          // 2px + a lifted shadow, not a hairline. Against a dashboard of
          // bordered cards a 1px rule reads as one more card edge rather than
          // as the boundary between the page and the chrome (owner, on FT,
          // 2026-08-07). The shadow is what actually sells "this floats above".
          borderTop: `2px solid ${colors.border}`,
          boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.08)',
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-around' }}>
          {destinations.map((d) => {
            const Icon = DASHBOARD_ICONS[d.icon]
            const active = isActive(d.href)
            return (
              <Link
                key={d.key}
                href={d.href}
                aria-current={active ? 'page' : undefined}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  // 44px is the accessible minimum tap target; 56 gives the
                  // label room without crowding the home indicator.
                  minHeight: 56,
                  padding: `${spacing['2xs']} ${spacing['3xs']}`,
                  textDecoration: 'none',
                  // The active tab is SHADED, not just tinted. Colour alone was
                  // too weak to read at a glance — and on food trucks, where the
                  // brand primary is red, a red-on-white label competes with
                  // every other red on the page instead of standing out.
                  // Background fill + a 3px accent bar is unambiguous, and it
                  // does not rely on colour perception alone.
                  color: active ? colors.primaryDark : colors.textMuted,
                  backgroundColor: active ? colors.primaryLight : 'transparent',
                  fontWeight: active ? typography.weights.semibold : typography.weights.normal,
                  borderTop: `3px solid ${active ? colors.primary : 'transparent'}`,
                }}
              >
                <Icon size={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                <span style={{ fontSize: typography.sizes.xs }}>{d.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* ── TABLET / DESKTOP: sticky left rail ────────────────────────── */}
      <nav
        className="dashboard-nav-rail"
        role="navigation"
        aria-label="Dashboard navigation"
        style={{
          // Fixed rather than in-flow: it means a page opts in by adding ONE
          // class to its root element instead of having its whole body wrapped
          // in a flex container. Four dashboards adopt this; restructuring four
          // page bodies to gain nothing visible was not a good trade.
          position: 'fixed',
          top: 96,
          left: spacing.sm,
          width: 180,
          zIndex: 40,
          padding: spacing.xs,
          backgroundColor: colors.surfaceElevated,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
        }}
      >
        <p style={{
          margin: `0 0 ${spacing['2xs']} 0`,
          padding: `0 ${spacing['2xs']}`,
          fontSize: typography.sizes.xs,
          fontWeight: typography.weights.semibold,
          color: statusColors.neutral500,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          My dashboards
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {destinations.map((d) => {
            const Icon = DASHBOARD_ICONS[d.icon]
            const active = isActive(d.href)
            return (
              <Link
                key={d.key}
                href={d.href}
                aria-current={active ? 'page' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xs,
                  minHeight: 44,
                  padding: `${spacing['2xs']} ${spacing.xs}`,
                  borderRadius: radius.sm,
                  textDecoration: 'none',
                  fontSize: typography.sizes.sm,
                  color: active ? colors.primaryDark : colors.textPrimary,
                  backgroundColor: active ? colors.primaryLight : 'transparent',
                  fontWeight: active ? typography.weights.semibold : typography.weights.normal,
                }}
              >
                <Icon size={18} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                <span>{d.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      <style>{`
        /* Mobile-first: the bar is the default, the rail is the enhancement.
           NOTE: no backticks in this comment - the block is a JS template
           literal and a stray one ends it early. */
        .dashboard-nav-rail { display: none; }
        .dashboard-nav-bar { display: block; }
        @media (min-width: 768px) {
          .dashboard-nav-rail { display: block; }
          .dashboard-nav-bar { display: none; }
        }
        /* A page opts in by putting has-dashboard-nav on its root element.
           Only offsets where the rail actually shows, and only when there is
           room to spare - below 1280 the content keeps the full width and the
           rail overlays nothing because it is hidden under 768 anyway. */
        @media (min-width: 768px) {
          .has-dashboard-nav { padding-left: 200px; }
        }
      `}</style>
    </>
  )
}

/**
 * Reserves height under the page content so the last card is not trapped behind
 * the fixed bottom bar. Phone only — the rail does not overlay anything.
 * Render at the END of a dashboard page, as a sibling of DashboardNav.
 */
export function DashboardNavSpacer({ destinations }: { destinations: NavDestination[] }) {
  if (destinations.length < 2) return null
  return (
    <>
      <div className="dashboard-nav-spacer" aria-hidden />
      <style>{`
        .dashboard-nav-spacer { height: calc(56px + env(safe-area-inset-bottom, 0px)); }
        @media (min-width: 768px) { .dashboard-nav-spacer { height: 0; } }
      `}</style>
    </>
  )
}
