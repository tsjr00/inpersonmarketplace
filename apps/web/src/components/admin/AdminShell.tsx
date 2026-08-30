'use client'

/**
 * AdminShell — the single admin chrome for BOTH tiers (phase 1 of the admin
 * UI rebuild, owner 2026-08-30; design in .claude/admin_ui_redesign_research.md).
 *
 * Replaces the old trio (platform AdminSidebar, per-page AdminNav pills, and
 * the vertical tree's nothing-at-all) with one mobile-first shell:
 *   · sticky top bar: scope pills (only the scopes this admin holds) + ☰
 *   · ☰ opens a grouped menu (Operate / People & places / Money / Quality /
 *     System) listing EVERY top-level admin page, with live queue badges
 *   · an amber dot on ☰ whenever any queue is non-zero
 *
 * Presentation only: the layouts resolve nav groups, badges and scopes
 * server-side (lib/admin/nav.ts + lib/admin/queue-badges.ts) and pass them in.
 */

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { spacing, typography, radius } from '@/lib/design-tokens'

export interface ShellScope {
  key: string
  label: string
  href: string
  active: boolean
}

export interface ShellLink {
  href: string
  label: string
  badge?: number
}

export interface ShellGroup {
  label: string
  links: ShellLink[]
}

interface AdminShellProps {
  scopes: ShellScope[]
  groups: ShellGroup[]
  adminEmail: string | null
  children: React.ReactNode
}

const BAR_BG = '#111827'
const ATTENTION = '#f59e0b'

export default function AdminShell({ scopes, groups, adminEmail, children }: AdminShellProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const attentionTotal = groups.reduce((n, g) => n + g.links.reduce((m, l) => m + (l.badge || 0), 0), 0)

  const isActive = (href: string) => {
    // Exact for hubs, prefix for subpages — longest match wins so '/admin'
    // doesn't light up on every platform page.
    if (pathname === href) return true
    const allHrefs = groups.flatMap(g => g.links.map(l => l.href))
    const matches = allHrefs.filter(h => pathname === h || pathname.startsWith(h + '/'))
    if (matches.length === 0) return false
    return matches.sort((a, b) => b.length - a.length)[0] === href
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        backgroundColor: BAR_BG, color: 'white',
        display: 'flex', alignItems: 'center', gap: spacing.xs,
        padding: `${spacing.xs} ${spacing.sm}`,
      }}>
        <span style={{ fontWeight: typography.weights.bold, fontSize: typography.sizes.sm, whiteSpace: 'nowrap' }}>
          ⚙️ Admin
        </span>
        {/* S6 fix (owner smoke 2026-08-30): a flex child only scrolls its
            overflow if it may SHRINK — without minWidth: 0 the pills were cut
            off on phones instead of scrolling. */}
        <nav aria-label="Admin scope" style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1, minWidth: 0, WebkitOverflowScrolling: 'touch' }}>
          {scopes.map(s => (
            <Link
              key={s.key}
              href={s.href}
              style={{
                padding: '4px 10px',
                borderRadius: radius.full,
                fontSize: typography.sizes.xs,
                fontWeight: typography.weights.semibold,
                whiteSpace: 'nowrap',
                textDecoration: 'none',
                backgroundColor: s.active ? 'white' : 'rgba(255,255,255,0.12)',
                color: s.active ? BAR_BG : 'white',
              }}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-label="Admin menu"
          style={{
            position: 'relative',
            background: 'none', border: '1px solid rgba(255,255,255,0.3)', color: 'white',
            borderRadius: radius.sm, padding: '4px 10px', fontSize: typography.sizes.base, cursor: 'pointer',
          }}
        >
          ☰
          {attentionTotal > 0 && (
            <span style={{
              position: 'absolute', top: -6, right: -6,
              backgroundColor: ATTENTION, color: BAR_BG,
              borderRadius: radius.full, fontSize: 10, fontWeight: 700,
              minWidth: 16, height: 16, lineHeight: '16px', textAlign: 'center', padding: '0 3px',
            }}>
              {attentionTotal > 99 ? '99+' : attentionTotal}
            </span>
          )}
        </button>
      </header>

      {open && (
        <div style={{
          position: 'sticky', top: 41, zIndex: 49,
          backgroundColor: BAR_BG, color: 'white',
          maxHeight: '75vh', overflowY: 'auto',
          padding: `${spacing.xs} ${spacing.sm} ${spacing.md}`,
          boxShadow: '0 8px 16px rgba(0,0,0,0.35)',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: spacing.md,
          }}>
            {groups.map(group => (
              <div key={group.label}>
                <div style={{
                  fontSize: typography.sizes.xs, fontWeight: typography.weights.bold,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: 'rgba(255,255,255,0.55)', margin: `${spacing.xs} 0 4px`,
                }}>
                  {group.label}
                </div>
                {group.links.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                      padding: '7px 8px', borderRadius: radius.sm,
                      fontSize: typography.sizes.sm, textDecoration: 'none',
                      color: isActive(link.href) ? BAR_BG : 'white',
                      backgroundColor: isActive(link.href) ? 'white' : 'transparent',
                    }}
                  >
                    <span>{link.label}</span>
                    {(link.badge || 0) > 0 && (
                      <span style={{
                        backgroundColor: ATTENTION, color: BAR_BG,
                        borderRadius: radius.full, fontSize: 11, fontWeight: 700,
                        minWidth: 18, textAlign: 'center', padding: '1px 5px',
                      }}>
                        {link.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            ))}
          </div>
          {adminEmail && (
            <div style={{ marginTop: spacing.sm, fontSize: typography.sizes.xs, color: 'rgba(255,255,255,0.5)' }}>
              Signed in as {adminEmail}
            </div>
          )}
        </div>
      )}

      <div style={{ overflowX: 'hidden', minWidth: 0, width: '100%' }}>
        {children}
      </div>
    </div>
  )
}
