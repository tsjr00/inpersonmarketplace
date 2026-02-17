'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CartButton } from '@/components/cart/CartButton'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { colors, spacing, typography, radius, shadows, containers } from '@/lib/design-tokens'
import { term } from '@/lib/vertical'

interface HeaderProps {
  vertical: string
  user?: { id: string; email?: string } | null
  userProfile?: { display_name?: string; role?: string; roles?: string[] } | null
  vendorProfile?: { id: string; status: string } | null
  branding: {
    brand_name: string
    logo_path?: string
    colors: {
      primary: string
      secondary: string
      background: string
      text: string
    }
  }
  isLandingPage?: boolean
}

export function Header({
  vertical,
  user,
  userProfile,
  vendorProfile,
  branding,
  isLandingPage = false
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  // Listen for auth state changes to detect user switching
  // This handles the case where a user logs out in another tab or duplicates a tab
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // If the user changed (different user ID or logged out/in), refresh the page
      const currentUserId = session?.user?.id || null
      const propsUserId = user?.id || null

      if (currentUserId !== propsUserId) {
        // User has changed - refresh to get correct header data
        router.refresh()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [user?.id, router, supabase.auth])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    setDropdownOpen(false)
    setMobileMenuOpen(false)
    await supabase.auth.signOut()
    router.push(`/${vertical}`)
    router.refresh()
  }

  // Detect landing page: path is exactly /{vertical} (no subpath)
  const isOnLandingPage = isLandingPage || (pathname && pathname.split('/').filter(Boolean).length === 1)

  const isAdmin = userProfile?.role === 'admin' ||
    userProfile?.role === 'platform_admin' ||
    userProfile?.roles?.includes('admin') ||
    userProfile?.roles?.includes('platform_admin')
  const isVendor = vendorProfile && vendorProfile.status === 'approved'
  const isPendingVendor = vendorProfile && ['submitted', 'draft'].includes(vendorProfile.status)
  const hasVendorProfile = !!vendorProfile

  return (
    <header style={{
      backgroundColor: isOnLandingPage ? 'transparent' : colors.surfaceElevated,
      borderBottom: isOnLandingPage ? 'none' : `1px solid ${colors.border}`,
      position: isOnLandingPage ? 'absolute' : 'sticky',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 50
    }}>
      <div style={{
        maxWidth: containers.xl,
        margin: '0 auto',
        padding: `0 ${spacing.sm}`
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: 56
        }}>
          {/* Logo */}
          <Link
            href={`/${vertical}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              textDecoration: 'none'
            }}
          >
            {branding.logo_path ? (
              <Image
                src={branding.logo_path}
                alt={branding.brand_name}
                width={0}
                height={0}
                sizes={isOnLandingPage ? '320px' : '200px'}
                style={{ width: 'auto', height: isOnLandingPage ? 86 : 53 }}
                priority
              />
            ) : (
              <span style={{
                fontSize: typography.sizes.xl,
                fontWeight: typography.weights.bold,
                color: colors.primary
              }}>
                {branding.brand_name}
              </span>
            )}
          </Link>

          {/* Desktop Navigation - hidden on mobile */}
          <nav style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.md
          }}
          className="desktop-nav"
          >
            <Link
              href={`/${vertical}/browse`}
              style={{
                color: pathname?.includes('/browse') ? colors.primary : colors.textSecondary,
                textDecoration: 'none',
                fontWeight: pathname?.includes('/browse') ? typography.weights.semibold : typography.weights.normal,
                fontSize: typography.sizes.sm
              }}
            >
              {term(vertical, 'products')}
            </Link>

            <Link
              href={`/${vertical}/markets`}
              style={{
                color: pathname?.includes('/markets') && !pathname?.includes('/market-box') ? colors.primary : colors.textSecondary,
                textDecoration: 'none',
                fontWeight: pathname?.includes('/markets') && !pathname?.includes('/market-box') ? typography.weights.semibold : typography.weights.normal,
                fontSize: typography.sizes.sm
              }}
            >
              {term(vertical, 'markets')}
            </Link>

            <Link
              href={`/${vertical}/vendors`}
              style={{
                color: pathname?.includes('/vendors') && !pathname?.includes('/vendor/') ? colors.primary : colors.textSecondary,
                textDecoration: 'none',
                fontWeight: pathname?.includes('/vendors') && !pathname?.includes('/vendor/') ? typography.weights.semibold : typography.weights.normal,
                fontSize: typography.sizes.sm
              }}
            >
              {term(vertical, 'vendors')}
            </Link>

            {user && (
              <Link
                href={`/${vertical}/dashboard`}
                style={{
                  color: pathname === `/${vertical}/dashboard` ? colors.primary : colors.textSecondary,
                  textDecoration: 'none',
                  fontWeight: pathname === `/${vertical}/dashboard` ? typography.weights.semibold : typography.weights.normal,
                  fontSize: typography.sizes.sm
                }}
              >
                Dashboard
              </Link>
            )}
          </nav>

          {/* Right Side - Cart & User */}
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
            {/* Notifications & Cart - logged in users */}
            {user && <NotificationBell primaryColor={colors.primary} vertical={vertical} />}
            {user && <CartButton primaryColor={colors.primary} />}

            {/* User Menu - Desktop */}
            {user ? (
              <div style={{ position: 'relative' }} ref={dropdownRef} className="desktop-nav">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing['3xs'],
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: spacing['2xs'],
                    minHeight: 44,
                    minWidth: 44
                  }}
                  aria-label="User menu"
                >
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: radius.full,
                    backgroundColor: colors.primaryLight,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: colors.primaryDark,
                    fontWeight: typography.weights.semibold,
                    fontSize: typography.sizes.sm
                  }}>
                    {userProfile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?'}
                  </div>
                  <span style={{
                    fontSize: typography.sizes.xs,
                    transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform 0.2s',
                    color: colors.textMuted
                  }}>
                    ▼
                  </span>
                </button>

                {/* Dropdown Menu */}
                {dropdownOpen && (
                  <div style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    marginTop: spacing['2xs'],
                    width: 240,
                    backgroundColor: colors.surfaceElevated,
                    borderRadius: radius.lg,
                    boxShadow: shadows.lg,
                    border: `1px solid ${colors.border}`,
                    overflow: 'hidden',
                    zIndex: 100
                  }}>
                    {/* User Info */}
                    <div style={{
                      padding: `${spacing.xs} ${spacing.sm}`,
                      borderBottom: `1px solid ${colors.border}`
                    }}>
                      <p style={{
                        margin: 0,
                        fontWeight: typography.weights.semibold,
                        fontSize: typography.sizes.sm,
                        color: colors.textPrimary
                      }}>
                        {userProfile?.display_name || 'User'}
                      </p>
                      <p style={{
                        margin: `${spacing['3xs']} 0 0`,
                        fontSize: typography.sizes.xs,
                        color: colors.textMuted,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {user.email}
                      </p>
                    </div>

                    {/* Navigation Items */}
                    <Link
                      href={`/${vertical}/buyer/orders`}
                      onClick={() => setDropdownOpen(false)}
                      style={{
                        display: 'block',
                        padding: `${spacing.xs} ${spacing.sm}`,
                        textDecoration: 'none',
                        color: colors.textPrimary,
                        fontSize: typography.sizes.sm,
                        minHeight: 44,
                        lineHeight: '20px'
                      }}
                    >
                      My Orders
                    </Link>

                    {/* Become a Vendor - only for non-vendors */}
                    {!hasVendorProfile && (
                      <Link
                        href={`/${vertical}/vendor-signup`}
                        onClick={() => setDropdownOpen(false)}
                        style={{
                          display: 'block',
                          padding: `${spacing.xs} ${spacing.sm}`,
                          textDecoration: 'none',
                          color: colors.primaryDark,
                          fontSize: typography.sizes.sm,
                          backgroundColor: colors.primaryLight,
                          minHeight: 44,
                          lineHeight: '20px'
                        }}
                      >
                        {term(vertical, 'vendor_signup_cta')}
                      </Link>
                    )}

                    {/* Vendor Dashboard - only for vendors */}
                    {(isVendor || isPendingVendor) && (
                      <Link
                        href={`/${vertical}/vendor/dashboard`}
                        onClick={() => setDropdownOpen(false)}
                        style={{
                          display: 'block',
                          padding: `${spacing.xs} ${spacing.sm}`,
                          textDecoration: 'none',
                          color: colors.textPrimary,
                          fontSize: typography.sizes.sm,
                          minHeight: 44,
                          lineHeight: '20px'
                        }}
                      >
                        {term(vertical, 'vendor_dashboard_nav')}
                        {isPendingVendor && (
                          <span style={{
                            marginLeft: spacing['2xs'],
                            fontSize: typography.sizes.xs,
                            color: '#856404',
                            backgroundColor: '#fff3cd',
                            padding: `2px ${spacing['3xs']}`,
                            borderRadius: radius.sm
                          }}>
                            Pending
                          </span>
                        )}
                      </Link>
                    )}

                    {/* Admin Dashboard - only for admins */}
                    {isAdmin && (
                      <Link
                        href={`/${vertical}/admin`}
                        onClick={() => setDropdownOpen(false)}
                        style={{
                          display: 'block',
                          padding: `${spacing.xs} ${spacing.sm}`,
                          textDecoration: 'none',
                          color: '#7c3aed',
                          fontSize: typography.sizes.sm,
                          backgroundColor: '#f5f3ff',
                          minHeight: 44,
                          lineHeight: '20px'
                        }}
                      >
                        Admin Dashboard
                      </Link>
                    )}

                    <div style={{ borderTop: `1px solid ${colors.border}` }} />

                    {/* Settings */}
                    <Link
                      href={`/${vertical}/settings`}
                      onClick={() => setDropdownOpen(false)}
                      style={{
                        display: 'block',
                        padding: `${spacing.xs} ${spacing.sm}`,
                        textDecoration: 'none',
                        color: colors.textPrimary,
                        fontSize: typography.sizes.sm,
                        minHeight: 44,
                        lineHeight: '20px'
                      }}
                    >
                      Settings
                    </Link>

                    {/* Logout */}
                    <button
                      onClick={handleLogout}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: `${spacing.xs} ${spacing.sm}`,
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        color: '#dc3545',
                        fontSize: typography.sizes.sm,
                        cursor: 'pointer',
                        minHeight: 44
                      }}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing['2xs'] }} className="desktop-nav">
                <Link
                  href={`/${vertical}/login`}
                  style={{
                    color: colors.primary,
                    textDecoration: 'none',
                    fontWeight: typography.weights.semibold,
                    fontSize: typography.sizes.sm,
                    padding: `${spacing['2xs']} ${spacing.xs}`,
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  Login
                </Link>
                <Link
                  href={`/${vertical}/signup`}
                  style={{
                    padding: `${spacing['2xs']} ${spacing.sm}`,
                    backgroundColor: colors.primary,
                    color: colors.textInverse,
                    textDecoration: 'none',
                    borderRadius: radius.md,
                    fontWeight: typography.weights.semibold,
                    fontSize: typography.sizes.sm,
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  Sign Up
                </Link>
              </div>
            )}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{
                display: 'none',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: spacing['2xs'],
                minHeight: 44,
                minWidth: 44,
                alignItems: 'center',
                justifyContent: 'center'
              }}
              className="mobile-menu-btn"
              aria-label="Menu"
            >
              <span style={{ fontSize: 24 }}>{mobileMenuOpen ? '✕' : '☰'}</span>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div
            style={{
              borderTop: `1px solid ${colors.border}`,
              padding: `${spacing.sm} 0`,
              backgroundColor: colors.surfaceElevated
            }}
            className="mobile-menu"
          >
            <Link
              href={`/${vertical}/browse`}
              onClick={() => setMobileMenuOpen(false)}
              style={{
                display: 'block',
                padding: `${spacing.xs} 0`,
                textDecoration: 'none',
                color: colors.textPrimary,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.medium
              }}
            >
              {term(vertical, 'products')}
            </Link>

            <Link
              href={`/${vertical}/markets`}
              onClick={() => setMobileMenuOpen(false)}
              style={{
                display: 'block',
                padding: `${spacing.xs} 0`,
                textDecoration: 'none',
                color: colors.textPrimary,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.medium
              }}
            >
              {term(vertical, 'markets')}
            </Link>

            <Link
              href={`/${vertical}/vendors`}
              onClick={() => setMobileMenuOpen(false)}
              style={{
                display: 'block',
                padding: `${spacing.xs} 0`,
                textDecoration: 'none',
                color: colors.textPrimary,
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.medium
              }}
            >
              {term(vertical, 'vendors')}
            </Link>

            {user ? (
              <>
                <Link
                  href={`/${vertical}/dashboard`}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: 'block',
                    padding: `${spacing.xs} 0`,
                    textDecoration: 'none',
                    color: colors.textPrimary,
                    fontSize: typography.sizes.base,
                    fontWeight: typography.weights.medium
                  }}
                >
                  Dashboard
                </Link>

                <Link
                  href={`/${vertical}/buyer/orders`}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: 'block',
                    padding: `${spacing.xs} 0`,
                    textDecoration: 'none',
                    color: colors.textPrimary,
                    fontSize: typography.sizes.base
                  }}
                >
                  My Orders
                </Link>

                {!hasVendorProfile && (
                  <Link
                    href={`/${vertical}/vendor-signup`}
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      display: 'block',
                      padding: `${spacing.xs} 0`,
                      textDecoration: 'none',
                      color: colors.primaryDark,
                      fontSize: typography.sizes.base,
                      fontWeight: typography.weights.medium
                    }}
                  >
                    {term(vertical, 'vendor_signup_cta')}
                  </Link>
                )}

                {(isVendor || isPendingVendor) && (
                  <Link
                    href={`/${vertical}/vendor/dashboard`}
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      display: 'block',
                      padding: `${spacing.xs} 0`,
                      textDecoration: 'none',
                      color: colors.textPrimary,
                      fontSize: typography.sizes.base
                    }}
                  >
                    {term(vertical, 'vendor_dashboard_nav')}
                    {isPendingVendor && (
                      <span style={{
                        marginLeft: spacing['2xs'],
                        fontSize: typography.sizes.xs,
                        color: '#856404',
                        backgroundColor: '#fff3cd',
                        padding: `2px ${spacing['3xs']}`,
                        borderRadius: radius.sm
                      }}>
                        Pending
                      </span>
                    )}
                  </Link>
                )}

                {isAdmin && (
                  <Link
                    href={`/${vertical}/admin`}
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      display: 'block',
                      padding: `${spacing.xs} 0`,
                      textDecoration: 'none',
                      color: '#7c3aed',
                      fontSize: typography.sizes.base,
                      fontWeight: typography.weights.medium
                    }}
                  >
                    Admin Dashboard
                  </Link>
                )}

                <div style={{ borderTop: `1px solid ${colors.border}`, margin: `${spacing.xs} 0` }} />

                <Link
                  href={`/${vertical}/settings`}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: 'block',
                    padding: `${spacing.xs} 0`,
                    textDecoration: 'none',
                    color: colors.textPrimary,
                    fontSize: typography.sizes.base
                  }}
                >
                  Settings
                </Link>

                <button
                  onClick={handleLogout}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: `${spacing.xs} 0`,
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: '#dc3545',
                    fontSize: typography.sizes.base,
                    cursor: 'pointer'
                  }}
                >
                  Logout
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, marginTop: spacing.xs }}>
                <Link
                  href={`/${vertical}/login`}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: 'block',
                    padding: `${spacing.xs} ${spacing.sm}`,
                    textDecoration: 'none',
                    color: colors.primary,
                    fontSize: typography.sizes.base,
                    fontWeight: typography.weights.semibold,
                    textAlign: 'center',
                    border: `2px solid ${colors.primary}`,
                    borderRadius: radius.md
                  }}
                >
                  Login
                </Link>
                <Link
                  href={`/${vertical}/signup`}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: 'block',
                    padding: `${spacing.xs} ${spacing.sm}`,
                    backgroundColor: colors.primary,
                    color: colors.textInverse,
                    textDecoration: 'none',
                    borderRadius: radius.md,
                    fontWeight: typography.weights.semibold,
                    fontSize: typography.sizes.base,
                    textAlign: 'center'
                  }}
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Responsive Styles */}
      <style>{`
        @media (max-width: 640px) {
          .desktop-nav {
            display: none !important;
          }
          .mobile-menu-btn {
            display: flex !important;
          }
        }
        @media (min-width: 641px) {
          .mobile-menu-btn {
            display: none !important;
          }
          .mobile-menu {
            display: none !important;
          }
        }
      `}</style>
    </header>
  )
}
