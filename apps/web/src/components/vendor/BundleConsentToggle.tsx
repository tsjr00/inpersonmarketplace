'use client'

import { useState } from 'react'
import { colors, spacing, typography, radius, statusColors } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

/**
 * Vendor bundle consent (mig 244) — the GLOBAL opt-out. Vendors are IN by
 * default (locked decision; announced by the one-time bundles_intro send):
 * they sell at their full listed price and get paid exactly as on a plain
 * order. Saves through /api/vendor/bundle-consent; the setting takes effect
 * everywhere at once (composition, approval re-check, and checkout all read
 * vendor_profiles.bundles_opt_out).
 */
interface BundleConsentToggleProps {
  vendorId: string
  initialOptOut: boolean
}

export default function BundleConsentToggle({ vendorId, initialOptOut }: BundleConsentToggleProps) {
  const locale = getClientLocale()
  const [optOut, setOptOut] = useState(initialOptOut)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const toggle = async (nextOptOut: boolean) => {
    if (busy) return
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/vendor/bundle-consent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: vendorId, optOut: nextOptOut }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setOptOut(nextOptOut)
        setResult({
          type: 'success',
          text: nextOptOut ? t('bundle.consent_out_msg', locale) : t('bundle.consent_in_msg', locale),
        })
      } else {
        setResult({ type: 'error', text: (data.error as string) || t('bundle.consent_error', locale) })
      }
    } catch {
      setResult({ type: 'error', text: t('bundle.consent_error', locale) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 24, border: '1px solid #e5e7eb' }}>
      <h2 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 600 }}>🧺 {t('bundle.consent_title', locale)}</h2>
      <p style={{ margin: `0 0 ${spacing.sm}`, fontSize: typography.sizes.sm, color: colors.textMuted, lineHeight: 1.5 }}>
        {t('bundle.consent_desc', locale)}
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, fontSize: typography.sizes.sm, color: colors.textPrimary, cursor: busy ? 'wait' : 'pointer' }}>
        <input
          type="checkbox"
          checked={!optOut}
          disabled={busy}
          onChange={(e) => toggle(!e.target.checked)}
        />
        {t('bundle.consent_label', locale)}
      </label>
      {result && (
        <div style={{
          marginTop: spacing.sm,
          padding: `${spacing.xs} ${spacing.sm}`,
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm,
          backgroundColor: result.type === 'success' ? statusColors.successLight : statusColors.dangerLight,
          color: result.type === 'success' ? statusColors.successDark : statusColors.dangerDark,
          border: `1px solid ${result.type === 'success' ? statusColors.successBorder : statusColors.dangerBorder}`,
        }}>
          {result.text}
        </div>
      )}
    </div>
  )
}
