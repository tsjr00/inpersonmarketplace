'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import QRCode from 'qrcode'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'
import { defaultBranding } from '@/lib/branding'

/**
 * Print-ready branded pickup signs (owner, 2026-08-28): one standardized sign
 * every vendor prints at 8.5×11 or 11×17, so app customers can find the
 * app-order pickup line at any truck or booth on the platform. Nothing to
 * download — the browser's print dialog produces the PDF/paper; the @page
 * rule sets the sheet size and the layout scales with it.
 */
interface Props {
  vertical: string
  brandName: string
  tagline: string
  logoPath: string
  primary: string
  businessName: string
  vendorId: string
}

type Size = 'letter' | 'tabloid'

export default function PickupSignsClient({ vertical, brandName, tagline, logoPath, primary, businessName, vendorId }: Props) {
  const [size, setSize] = useState<Size>('letter')
  const isFT = vertical === 'food_trucks'
  // Owner 2026-08-30: the sign carries the vendor's profile QR code, so
  // walk-up customers can scan it and order ahead next time. Same URL the
  // Marketing & Promotions QR uses.
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  useEffect(() => {
    const branding = defaultBranding[vertical] || defaultBranding.farmers_market
    const url = branding?.domain
      ? `https://${branding.domain}/${vertical}/vendor/${vendorId}/profile`
      : `${window.location.protocol}//${window.location.host}/${vertical}/vendor/${vendorId}/profile`
    QRCode.toDataURL(url, {
      width: 400,
      margin: 1,
      color: { dark: '#1a1a1a', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    }).then(setQrDataUrl).catch(() => { /* sign renders without the QR */ })
  }, [vertical, vendorId])

  const print = (s: Size) => {
    setSize(s)
    // Let the @page rule pick up the new size before the dialog opens.
    setTimeout(() => window.print(), 50)
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: `${spacing.md} ${spacing.sm}` }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          /* Owner 2026-08-30: the print grabbed the site header/nav — the
             paper must be ONLY the sign. */
          header, nav, footer { display: none !important; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; margin: 0; }
          .sign-sheet { box-shadow: none !important; margin: 0 !important; width: 100% !important; height: 100vh !important; border-radius: 0 !important; }
          @page { size: ${size === 'letter' ? '8.5in 11in' : '11in 17in'} portrait; margin: 0.4in; }
        }
      `}</style>

      <div className="no-print" style={{ marginBottom: spacing.md }}>
        <Link href={`/${vertical}/vendor/dashboard`} style={{ color: colors.textMuted, textDecoration: 'none', fontSize: typography.sizes.sm }}>← Back to Dashboard</Link>
        <h1 style={{ margin: `${spacing.xs} 0 ${spacing['2xs']}`, color: colors.primary, fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold }}>Pickup signs</h1>
        <p style={{ margin: `0 0 ${spacing.sm}`, color: colors.textSecondary, fontSize: typography.sizes.sm, lineHeight: 1.5, maxWidth: 640 }}>
          Post this where app customers collect their orders — a separate spot from your walk-up line. Print it on plain paper or card stock; the same sign is used across every {isFT ? 'truck' : 'booth'} on {brandName}, so customers recognize it.
        </p>
        <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>
          <button onClick={() => print('letter')} style={btn(primary)}>Print 8.5 × 11</button>
          <button onClick={() => print('tabloid')} style={btn(primary)}>Print 11 × 17</button>
        </div>
        <p style={{ margin: `${spacing.xs} 0 0`, color: colors.textMuted, fontSize: typography.sizes.xs }}>
          In the print dialog choose &ldquo;Save as PDF&rdquo; to keep a copy, and turn on background graphics if the colored band doesn&apos;t print.
        </p>
      </div>

      <div
        className="sign-sheet"
        style={{
          width: '100%',
          aspectRatio: size === 'letter' ? '8.5 / 11' : '11 / 17',
          backgroundColor: 'white',
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          margin: '0 auto',
        }}
      >
        <div style={{ backgroundColor: primary, color: 'white', padding: '6% 6% 5%', textAlign: 'center' }}>
          <div style={{ fontSize: 'clamp(28px, 7vw, 84px)', fontWeight: 800, letterSpacing: '0.02em', lineHeight: 1.05 }}>
            APP ORDER<br />PICKUP
          </div>
          <div style={{ fontSize: 'clamp(14px, 2.6vw, 30px)', fontWeight: 600, marginTop: '2%', opacity: 0.95 }}>
            Ordered ahead on {brandName}? Collect here.
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6%', textAlign: 'center', gap: '4%' }}>
          <div style={{ position: 'relative', width: '38%', aspectRatio: '1 / 1' }}>
            <Image src={logoPath} alt={brandName} fill sizes="400px" style={{ objectFit: 'contain' }} />
          </div>
          <div style={{ fontSize: 'clamp(16px, 3.2vw, 40px)', fontWeight: 700, color: '#1a1a1a' }}>{businessName}</div>
          <div style={{ fontSize: 'clamp(12px, 2vw, 24px)', color: '#4b5563', lineHeight: 1.4, maxWidth: '85%' }}>
            Have your order number ready. No need to wait in the walk-up line — that&apos;s the point.
          </div>
          {qrDataUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1%', marginTop: '2%' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="Order-ahead QR code" style={{ width: '22%', minWidth: 90, aspectRatio: '1 / 1' }} />
              <div style={{ fontSize: 'clamp(11px, 1.8vw, 20px)', fontWeight: 600, color: '#1a1a1a' }}>
                Waiting in the walk-up line? Scan to order ahead next time.
              </div>
            </div>
          )}
        </div>
        <div style={{ borderTop: `6px solid ${primary}`, padding: '3% 6%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#6b7280', fontSize: 'clamp(10px, 1.6vw, 18px)' }}>
          <span>{tagline}</span>
          <span style={{ fontWeight: 600, color: primary }}>{brandName.replace(/'/g, '’')}</span>
        </div>
      </div>
    </div>
  )
}

function btn(primary: string): React.CSSProperties {
  return {
    padding: `${spacing.xs} ${spacing.md}`,
    backgroundColor: primary,
    color: 'white',
    border: 'none',
    borderRadius: radius.sm,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    cursor: 'pointer',
    minHeight: 44,
  }
}
