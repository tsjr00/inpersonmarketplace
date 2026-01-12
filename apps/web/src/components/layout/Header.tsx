'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
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
    await supabase.auth.signOut()
    router.push(`/${vertical}`)
    router.refresh()
  }

  const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')
  const isVendor = vendorProfile && vendorProfile.status === 'approved'
  const isPendingVendor = vendorProfile && ['submitted', 'draft'].includes(vendorProfile.status)

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
        padding: '0 20px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: 64
        }}>
          {/* Logo */}
          <Link
            href={`/${vertical}`}
            style={{
              fontSize: 24,
              fontWeight: 'bold',
              color: branding.colors.primary,
              textDecoration: 'none'
            }}
          >
            {branding.brand_name}
          </Link>

          {/* Main Navigation */}
          <nav style={{
            display: 'flex',
            alignItems: 'center',
            gap: 30
          }}>
            <Link
              href={`/${vertical}/browse`}
              style={{
                color: pathname?.includes('/browse') ? branding.colors.primary : branding.colors.text,
                textDecoration: 'none',
                fontWeight: pathname?.includes('/browse') ? 600 : 400
              }}
            >
              Browse
            </Link>

            {user && (
              <Link
                href={`/${vertical}/dashboard`}
                style={{
                  color: pathname === `/${vertical}/dashboard` ? branding.colors.primary : branding.colors.text,
                  textDecoration: 'none',
                  fontWeight: pathname === `/${vertical}/dashboard` ? 600 : 400
                }}
              >
                Dashboard
              </Link>
            )}
          </nav>

          {/* Right Side - Cart & User */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
            {/* Cart */}
            {user && <CartButton primaryColor={branding.colors.primary} />}

            {/* User Menu */}
            {user ? (
              <div style={{ position: 'relative' }} ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 8
                  }}
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
                    fontSize: 14,
                    transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform 0.2s'
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
                    width: 220,
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
                        fontSize: 14
                      }}
                    >
                      My Orders
                    </Link>

                    {(isVendor || isPendingVendor) && (
                      <Link
                        href={`/${vertical}/vendor/dashboard`}
                        onClick={() => setDropdownOpen(false)}
                        style={{
                          display: 'block',
                          padding: '12px 16px',
                          textDecoration: 'none',
                          color: '#333',
                          fontSize: 14
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
                          backgroundColor: '#f5f3ff'
                        }}
                      >
                        Admin Dashboard
                      </Link>
                    )}

                    <div style={{ borderTop: '1px solid #eee' }} />

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
                        cursor: 'pointer'
                      }}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Link
                  href={`/${vertical}/login`}
                  style={{
                    color: branding.colors.primary,
                    textDecoration: 'none',
                    fontWeight: 600
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
                    fontWeight: 600
                  }}
                >
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
