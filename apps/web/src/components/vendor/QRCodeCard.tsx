'use client'

import { useState, useEffect, useRef } from 'react'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { defaultBranding } from '@/lib/branding'
import QRCode from 'qrcode'

interface QRCodeCardProps {
  vertical: string
  vendorId: string
  vendorName: string
}

export default function QRCodeCard({ vertical, vendorId, vendorName }: QRCodeCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [showPrintView, setShowPrintView] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const profileUrl = `${branding.domain ? `https://${branding.domain}` : ''}/${vertical}/vendor/${vendorId}/profile`
  const isFT = vertical === 'food_trucks'

  useEffect(() => {
    QRCode.toDataURL(profileUrl, {
      width: 280,
      margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
      errorCorrectionLevel: 'H', // High error correction — supports logo overlay
    }).then(setQrDataUrl).catch(() => { /* QR generation failed */ })
  }, [profileUrl])

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

  if (!qrDataUrl) return null

  return (
    <>
      <div style={{
        padding: spacing.sm,
        backgroundColor: colors.surfaceElevated,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
      }}>
        <h4 style={{
          margin: `0 0 ${spacing.xs} 0`,
          fontSize: typography.sizes.sm,
          fontWeight: typography.weights.semibold,
          color: colors.primary,
        }}>
          QR Code — Put This on Your {isFT ? 'Truck' : 'Table'}
        </h4>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.sm,
        }}>
          {/* QR preview */}
          <div style={{
            width: 100,
            height: 100,
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
              Customers scan this to see your menu and pre-order. Print it and put it where customers can see it.
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

      {/* Hidden print layout — full printable card */}
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
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {branding.brand_name}
              </div>
              <div style={{ marginBottom: 16 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR Code" style={{ width: 240, height: 240 }} />
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>
                {vendorName}
              </div>
              <div style={{ fontSize: 16, color: '#4b5563', marginBottom: 16 }}>
                Skip the line — pre-order online!
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                Scan with your phone camera to view menu &amp; order
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
