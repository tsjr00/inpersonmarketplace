'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CartButton } from '@/components/cart/CartButton'

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
}

export function Header({
  vertical,
  user,
  userProfile,
  vendorProfile,
  branding
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

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

  const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')
  const isVendor = vendorProfile && vendorProfile.status === 'approved'
  const isPendingVendor = vendorProfile && ['submitted', 'draft'].includes(vendorProfile.status)
  const hasVendorProfile = !!vendorProfile

  return (
    <header style={{
      backgroundColor: 'white',
      borderBottom: `1px solid ${branding.colors.secondary}`,
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 16px'
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
                width={180}
                height={60}
                style={{ height: 'auto', maxHeight: 60 }}
                priority
              />
            ) : (
              <span style={{
                fontSize: 20,
                fontWeight: 'bold',
                color: branding.colors.primary
              }}>
                {branding.brand_name}
              </span>
            )}
          </Link>

          {/* Desktop Navigation - hidden on mobile */}
          <nav style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24
          }}
          className="desktop-nav"
          >
            <Link
              href={`/${vertical}/browse`}
              style={{
                color: pathname?.includes('/browse') ? branding.colors.primary : branding.colors.text,
                textDecoration: 'none',
                fontWeight: pathname?.includes('/browse') ? 600 : 400,
                fontSize: 14
              }}
            >
              Browse Products
            </Link>

            {user && (
              <Link
                href={`/${vertical}/dashboard`}
                style={{
                  color: pathname === `/${vertical}/dashboard` ? branding.colors.primary : branding.colors.text,
                  textDecoration: 'none',
                  fontWeight: pathname === `/${vertical}/dashboard` ? 600 : 400,
                  fontSize: 14
                }}
              >
                Dashboard
              </Link>
            )}
          </nav>

          {/* Right Side - Cart & User */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Cart - always visible */}
            {user && <CartButton primaryColor={branding.colors.primary} />}

            {/* User Menu - Desktop */}
            {user ? (
              <div style={{ position: 'relative' }} ref={dropdownRef} className="desktop-nav">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 8,
                    minHeight: 44,
                    minWidth: 44
                  }}
                  aria-label="User menu"
                >
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: branding.colors.primary + '20',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: branding.colors.primary,
                    fontWeight: 600,
                    fontSize: 14
                  }}>
                    {userProfile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?'}
                  </div>
                  <span style={{
                    fontSize: 12,
                    transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform 0.2s',
                    color: '#666'
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
                    marginTop: 8,
                    width: 240,
                    backgroundColor: 'white',
                    borderRadius: 8,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                    border: '1px solid #eee',
                    overflow: 'hidden',
                    zIndex: 100
                  }}>
                    {/* User Info */}
                    <div style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid #eee'
                    }}>
                      <p style={{
                        margin: 0,
                        fontWeight: 600,
                        fontSize: 14,
                        color: '#333'
                      }}>
                        {userProfile?.display_name || 'User'}
                      </p>
                      <p style={{
                        margin: '4px 0 0',
                        fontSize: 12,
                        color: '#666',
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
                        padding: '12px 16px',
                        textDecoration: 'none',
                        color: '#333',
                        fontSize: 14,
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
                          padding: '12px 16px',
                          textDecoration: 'none',
                          color: '#059669',
                          fontSize: 14,
                          backgroundColor: '#ecfdf5',
                          minHeight: 44,
                          lineHeight: '20px'
                        }}
                      >
                        Become a Vendor
                      </Link>
                    )}

                    {/* Vendor Dashboard - only for vendors */}
                    {(isVendor || isPendingVendor) && (
                      <Link
                        href={`/${vertical}/vendor/dashboard`}
                        onClick={() => setDropdownOpen(false)}
                        style={{
                          display: 'block',
                          padding: '12px 16px',
                          textDecoration: 'none',
                          color: '#333',
                          fontSize: 14,
                          minHeight: 44,
                          lineHeight: '20px'
                        }}
                      >
                        Vendor Dashboard
                        {isPendingVendor && (
                          <span style={{
                            marginLeft: 8,
                            fontSize: 11,
                            color: '#856404',
                            backgroundColor: '#fff3cd',
                            padding: '2px 6px',
                            borderRadius: 4
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
                          padding: '12px 16px',
                          textDecoration: 'none',
                          color: '#7c3aed',
                          fontSize: 14,
                          backgroundColor: '#f5f3ff',
                          minHeight: 44,
                          lineHeight: '20px'
                        }}
                      >
                        Admin Dashboard
                      </Link>
                    )}

                    <div style={{ borderTop: '1px solid #eee' }} />

                    {/* Settings */}
                    <Link
                      href={`/${vertical}/settings`}
                      onClick={() => setDropdownOpen(false)}
                      style={{
                        display: 'block',
                        padding: '12px 16px',
                        textDecoration: 'none',
                        color: '#333',
                        fontSize: 14,
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
                        padding: '12px 16px',
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        color: '#dc3545',
                        fontSize: 14,
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} className="desktop-nav">
                <Link
                  href={`/${vertical}/login`}
                  style={{
                    color: branding.colors.primary,
                    textDecoration: 'none',
                    fontWeight: 600,
                    fontSize: 14,
                    padding: '8px 12px',
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
                    padding: '8px 16px',
                    backgroundColor: branding.colors.primary,
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: 6,
                    fontWeight: 600,
                    fontSize: 14,
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
                padding: 8,
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
              borderTop: '1px solid #eee',
              padding: '16px 0',
              backgroundColor: 'white'
            }}
            className="mobile-menu"
          >
            <Link
              href={`/${vertical}/browse`}
              onClick={() => setMobileMenuOpen(false)}
              style={{
                display: 'block',
                padding: '12px 0',
                textDecoration: 'none',
                color: branding.colors.text,
                fontSize: 16,
                fontWeight: 500
              }}
            >
              Browse Products
            </Link>

            {user ? (
              <>
                <Link
                  href={`/${vertical}/dashboard`}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: 'block',
                    padding: '12px 0',
                    textDecoration: 'none',
                    color: branding.colors.text,
                    fontSize: 16,
                    fontWeight: 500
                  }}
                >
                  Dashboard
                </Link>

                <Link
                  href={`/${vertical}/buyer/orders`}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: 'block',
                    padding: '12px 0',
                    textDecoration: 'none',
                    color: branding.colors.text,
                    fontSize: 16
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
                      padding: '12px 0',
                      textDecoration: 'none',
                      color: '#059669',
                      fontSize: 16,
                      fontWeight: 500
                    }}
                  >
                    Become a Vendor
                  </Link>
                )}

                {(isVendor || isPendingVendor) && (
                  <Link
                    href={`/${vertical}/vendor/dashboard`}
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                      display: 'block',
                      padding: '12px 0',
                      textDecoration: 'none',
                      color: branding.colors.text,
                      fontSize: 16
                    }}
                  >
                    Vendor Dashboard
                    {isPendingVendor && (
                      <span style={{
                        marginLeft: 8,
                        fontSize: 12,
                        color: '#856404',
                        backgroundColor: '#fff3cd',
                        padding: '2px 6px',
                        borderRadius: 4
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
                      padding: '12px 0',
                      textDecoration: 'none',
                      color: '#7c3aed',
                      fontSize: 16,
                      fontWeight: 500
                    }}
                  >
                    Admin Dashboard
                  </Link>
                )}

                <div style={{ borderTop: '1px solid #eee', margin: '12px 0' }} />

                <Link
                  href={`/${vertical}/settings`}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: 'block',
                    padding: '12px 0',
                    textDecoration: 'none',
                    color: branding.colors.text,
                    fontSize: 16
                  }}
                >
                  Settings
                </Link>

                <button
                  onClick={handleLogout}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '12px 0',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: '#dc3545',
                    fontSize: 16,
                    cursor: 'pointer'
                  }}
                >
                  Logout
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                <Link
                  href={`/${vertical}/login`}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: 'block',
                    padding: '12px 16px',
                    textDecoration: 'none',
                    color: branding.colors.primary,
                    fontSize: 16,
                    fontWeight: 600,
                    textAlign: 'center',
                    border: `2px solid ${branding.colors.primary}`,
                    borderRadius: 8
                  }}
                >
                  Login
                </Link>
                <Link
                  href={`/${vertical}/signup`}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: 'block',
                    padding: '12px 16px',
                    backgroundColor: branding.colors.primary,
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 16,
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
