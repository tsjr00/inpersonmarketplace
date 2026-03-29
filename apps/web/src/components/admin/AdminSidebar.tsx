'use client'

import { useState } from 'react'
import Link from 'next/link'
import { spacing, typography, radius } from '@/lib/design-tokens'

interface AdminSidebarProps {
  adminEmail: string
  children: React.ReactNode
}

export default function AdminSidebar({ adminEmail, children }: AdminSidebarProps) {
  const [open, setOpen] = useState(false)

  const linkStyle = {
    padding: `${spacing.xs} ${spacing.sm}`,
    color: 'white',
    textDecoration: 'none' as const,
    borderRadius: radius.sm,
    display: 'block' as const,
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile overlay */}
      {open && (
        <div
          className="admin-sidebar-overlay open"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`admin-sidebar${open ? ' open' : ''}`}
        style={{
          backgroundColor: '#1a1a2e',
          color: 'white',
          padding: spacing.md,
          flexDirection: 'column',
        }}
      >
        <div style={{ marginBottom: spacing.lg }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: typography.sizes.lg, margin: 0 }}>Admin Panel</h2>
            {/* Close button — only visible on mobile when sidebar is open */}
            <button
              onClick={() => setOpen(false)}
              className="admin-sidebar-close"
              style={{
                background: 'none',
                border: 'none',
                color: '#888',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              ✕
            </button>
          </div>
          <p style={{ fontSize: typography.sizes.xs, color: '#888', margin: `${spacing['3xs']} 0 0` }}>{adminEmail}</p>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: spacing['3xs'] }}>
          <Link href="/admin" style={{ ...linkStyle, backgroundColor: 'rgba(255,255,255,0.1)' }} onClick={() => setOpen(false)}>
            Dashboard
          </Link>
          <Link href="/admin/vendors" style={linkStyle} onClick={() => setOpen(false)}>
            Vendors
          </Link>
          <Link href="/admin/vendors/pending" style={linkStyle} onClick={() => setOpen(false)}>
            Pending Approval
          </Link>
          <Link href="/admin/listings" style={linkStyle} onClick={() => setOpen(false)}>
            Listings
          </Link>
          <Link href="/admin/users" style={linkStyle} onClick={() => setOpen(false)}>
            Users
          </Link>
          <Link href="/admin/markets" style={linkStyle} onClick={() => setOpen(false)}>
            Markets
          </Link>
          <Link href="/admin/order-issues" style={linkStyle} onClick={() => setOpen(false)}>
            Order Issues
          </Link>

          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.2)',
            margin: `${spacing.md} 0`,
            paddingTop: spacing.md
          }}>
            <p style={{ fontSize: typography.sizes.xs, color: '#888', margin: `0 0 ${spacing['2xs']}`, paddingLeft: spacing.sm }}>
              Vertical Admin
            </p>
            <Link href="/farmers_market/admin" style={{ ...linkStyle, color: '#6b8e23' }} onClick={() => setOpen(false)}>
              Farmers Marketing
            </Link>
            <Link href="/food_trucks/admin" style={{ ...linkStyle, color: '#ff5757' }} onClick={() => setOpen(false)}>
              Food Truck&apos;n
            </Link>
            <Link href="/" style={{ ...linkStyle, color: '#888' }} onClick={() => setOpen(false)}>
              Back to Site
            </Link>
          </div>
        </nav>
      </aside>

      {/* Mobile toggle button */}
      <button
        className="admin-sidebar-toggle"
        onClick={() => setOpen(true)}
        aria-label="Open admin menu"
      >
        ☰
      </button>

      {/* Main Content */}
      <main className="admin-main-content" style={{
        backgroundColor: '#f5f5f5',
        padding: spacing.lg
      }}>
        {children}
      </main>

      {/* Responsive styles from shared utilities */}
      <style>{`
        .admin-sidebar-close {
          display: none;
        }
        @media (max-width: 767px) {
          .admin-sidebar-close {
            display: block;
          }
        }
      `}</style>
    </div>
  )
}
