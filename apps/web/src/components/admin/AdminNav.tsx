'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface AdminNavProps {
  type: 'vertical' | 'platform'
  vertical?: string
}

export default function AdminNav({ type, vertical }: AdminNavProps) {
  const pathname = usePathname()

  const isActive = (path: string) => {
    if (path === `/${vertical}/admin` || path === '/admin') {
      return pathname === path
    }
    return pathname === path || pathname?.startsWith(path + '/')
  }

  // Vertical admin links
  const verticalLinks = vertical ? [
    { label: 'Dashboard', href: `/${vertical}/admin`, icon: '📊' },
    { label: 'Analytics', href: `/${vertical}/admin/analytics`, icon: '📈' },
    { label: 'Markets', href: `/${vertical}/admin/markets`, icon: '🧺' },
    { label: 'Vendors', href: `/${vertical}/admin/vendors`, icon: '🧑‍🌾' },
    { label: 'Activity', href: `/${vertical}/admin/vendor-activity`, icon: '🔍' },
    { label: 'Listings', href: `/${vertical}/admin/listings`, icon: '📦' },
    { label: 'Users', href: `/${vertical}/admin/users`, icon: '👥' },
    { label: 'Reports', href: `/${vertical}/admin/reports`, icon: '📋' },
    { label: 'Feedback', href: `/${vertical}/admin/feedback`, icon: '💬' },
  ] : []

  // Platform admin links
  const platformLinks = [
    { label: 'Dashboard', href: '/admin', icon: '📊' },
    { label: 'Analytics', href: '/admin/analytics', icon: '📈' },
    { label: 'Vendors', href: '/admin/vendors', icon: '🏪' },
    { label: 'Pending', href: '/admin/vendors/pending', icon: '⏳' },
    { label: 'Listings', href: '/admin/listings', icon: '📦' },
    { label: 'Markets', href: '/admin/markets', icon: '🧺' },
    { label: 'Users', href: '/admin/users', icon: '👥' },
    { label: 'Reports', href: '/admin/reports', icon: '📋' },
  ]

  const links = type === 'vertical' ? verticalLinks : platformLinks

  return (
    <nav style={{
      display: 'flex',
      gap: 8,
      padding: '16px 0',
      borderBottom: '1px solid #e5e7eb',
      marginBottom: 24,
      overflowX: 'auto',
      flexWrap: 'wrap'
    }}>
      {links.map(link => (
        <Link
          key={link.href}
          href={link.href}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            borderRadius: 6,
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            backgroundColor: isActive(link.href) ? '#e0e7ff' : 'transparent',
            color: isActive(link.href) ? '#4338ca' : '#6b7280',
            border: isActive(link.href) ? '1px solid #c7d2fe' : '1px solid transparent'
          }}
        >
          <span>{link.icon}</span>
          <span>{link.label}</span>
        </Link>
      ))}

    </nav>
  )
}
