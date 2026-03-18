'use client'

import { useState, useEffect, useRef } from 'react'
import ShareButton from '@/components/marketing/ShareButton'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'
import { defaultBranding } from '@/lib/branding'
import QRCode from 'qrcode'

interface PromoteCardProps {
  vendorId: string
  vendorName: string
  vertical: string
}

export default function PromoteCard({ vendorId, vendorName, vertical }: PromoteCardProps) {
  const baseUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}`
    : ''
  const profileUrl = `${baseUrl}/${vertical}/vendor/${vendorId}/profile`

  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const isFT = vertical === 'food_trucks'
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [showPrintView, setShowPrintView] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!profileUrl || !baseUrl) return
    const fullUrl = branding.domain ? `https://${branding.domain}/${vertical}/vendor/${vendorId}/profile` : profileUrl
    QRCode.toDataURL(fullUrl, {
      width: 280,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    }).then(setQrDataUrl).catch(() => { /* QR generation failed */ })
  }, [profileUrl, baseUrl, branding.domain, vertical, vendorId])

  const handlePrint = () => {
    setShowPrintView(true)
    setTimeout(() => {
      if (printRef.current) {
        const printWindow = window.open('', '_blank')
        if (printWindow) {
          printWindow.document.write(`
            <html>
              <head><title>${vendorName} — QR Code</title></head>
              <body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh">
                ${printRef.current.innerHTML}
              </body>
            </html>
          `)
          printWindow.document.close()
          printWindow.focus()
          printWindow.print()
        }
      }
      setShowPrintView(false)
    }, 100)
  }

  return (
    <>
      <div style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        boxShadow: shadows.sm
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xs,
          marginBottom: spacing.xs
        }}>
          <span style={{ fontSize: typography.sizes.xl }}>📣</span>
          <h3 style={{
            color: colors.primary,
            margin: 0,
            fontSize: typography.sizes.base,
            fontWeight: typography.weights.semibold
          }}>
            Promote Your Business
          </h3>
        </div>

        {/* Social sharing */}
        <p style={{
          margin: `0 0 ${spacing.xs} 0`,
          fontSize: typography.sizes.sm,
          color: colors.textSecondary
        }}>
          Share on social media to reach more customers
        </p>

        {baseUrl && (
          <ShareButton
            url={profileUrl}
            title={`${vendorName} - Shop our products!`}
            text={`Check out ${vendorName} for fresh, local products!`}
            variant="button"
          />
        )}

        <p style={{
          margin: `${spacing.xs} 0 0 0`,
          fontSize: typography.sizes.xs,
          color: colors.textMuted
        }}>
          Share your profile, or share individual listings from your <a href={`/${vertical}/vendor/listings`} style={{ color: colors.primary }}>Listings page</a>
        </p>

        {/* QR Code section */}
        {qrDataUrl && (
          <div style={{
            marginTop: spacing.sm,
            paddingTop: spacing.sm,
            borderTop: `1px solid ${colors.border}`,
          }}>
            <h4 style={{
              margin: `0 0 ${spacing.xs} 0`,
              fontSize: typography.sizes.sm,
              fontWeight: typography.weights.semibold,
              color: colors.primary,
            }}>
              QR Code — Put This on Your {isFT ? 'Truck' : 'Table'}
            </h4>

            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <div style={{
                width: 80,
                height: 80,
                flexShrink: 0,
                borderRadius: radius.sm,
                overflow: 'hidden',
                border: `1px solid ${colors.border}`,
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR Code" style={{ width: '100%', height: '100%' }} />
              </div>

              <div style={{ flex: 1 }}>
                <p style={{
                  margin: `0 0 ${spacing['2xs']} 0`,
                  fontSize: typography.sizes.xs,
                  color: colors.textSecondary,
                }}>
                  Customers scan to see your menu and pre-order.
                </p>
                <div style={{ display: 'flex', gap: spacing['2xs'] }}>
                  <button
                    onClick={handlePrint}
                    style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      backgroundColor: colors.primary,
                      color: 'white',
                      border: 'none',
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      cursor: 'pointer',
                    }}
                  >
                    🖨️ Print
                  </button>
                  <a
                    href={qrDataUrl}
                    download={`${vendorName.replace(/[^a-zA-Z0-9]/g, '_')}_QR.png`}
                    style={{
                      padding: `${spacing['3xs']} ${spacing.xs}`,
                      backgroundColor: 'transparent',
                      color: colors.primary,
                      border: `1px solid ${colors.primary}`,
                      borderRadius: radius.sm,
                      fontSize: typography.sizes.xs,
                      fontWeight: typography.weights.semibold,
                      textDecoration: 'none',
                      display: 'inline-block',
                    }}
                  >
                    ⬇️ Save
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden print layout */}
      {showPrintView && (
        <div style={{ position: 'absolute', left: -9999, top: -9999 }}>
          <div ref={printRef}>
            <div style={{
              width: 400,
              padding: 32,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              textAlign: 'center',
              border: '2px solid #e5e7eb',
              borderRadius: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={branding.logo_path} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                <span style={{ fontSize: 15, fontWeight: 600, color: isFT ? '#ff5757' : '#166534' }}>
                  {branding.domain ? `www.${branding.domain}` : branding.brand_name}
                </span>
              </div>
              <div style={{ marginBottom: 20 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl!} alt="QR Code" style={{ width: 260, height: 260 }} />
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a', marginBottom: 8 }}>
                Skip the line — pre-order online!
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, color: isFT ? '#ff5757' : '#166534', marginBottom: 6 }}>
                {vendorName}
              </div>
              <div style={{ fontSize: 14, color: '#4b5563', fontStyle: 'italic' }}>
                Great food, ready when you are
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
