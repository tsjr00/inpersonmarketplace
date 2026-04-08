'use client'
import { useState } from 'react'
import { colors, spacing, typography, radius, sizing, statusColors } from '@/lib/design-tokens'

interface Props {
  vendorId: string
  currentData: {
    description?: string | null
    social_links?: Record<string, string> | null
    fee_discount_code?: string | null
  }
}

export default function ProfileEditForm({ vendorId, currentData }: Props) {
  const [formData, setFormData] = useState({
    description: currentData.description || '',
    facebook: currentData.social_links?.facebook || '',
    instagram: currentData.social_links?.instagram || '',
    website: currentData.social_links?.website || '',
    fee_discount_code: currentData.fee_discount_code || '',
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setMessage('')

    try {
      const res = await fetch('/api/vendor/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId,
          description: formData.description,
          social_links: {
            facebook: formData.facebook,
            instagram: formData.instagram,
            website: formData.website
          },
          fee_discount_code: formData.fee_discount_code || null,
        })
      })

      if (res.ok) {
        setMessage('Profile updated successfully!')
        setTimeout(() => setMessage(''), 3000)
      } else {
        const data = await res.json()
        setMessage(data.error || 'Failed to update profile')
      }
    } catch {
      setMessage('Error updating profile')
    } finally {
      setSaving(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: spacing['2xs'],
    fontWeight: typography.weights.semibold,
    fontSize: typography.sizes.sm,
  }

  const urlInputStyle: React.CSSProperties = {
    width: '100%',
    ...sizing.control,
    border: `1px solid ${statusColors.neutral300}`,
    boxSizing: 'border-box',
  }

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: radius.lg,
      padding: spacing.md
    }}>
      <h2 style={{ marginBottom: spacing.md, fontSize: typography.sizes.xl, fontWeight: typography.weights.semibold }}>
        About Your Business
      </h2>

      {/* Description - Both tiers */}
      <div style={{ marginBottom: spacing.md }}>
        <label style={labelStyle}>Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Tell customers about your farm, your practices, what makes your products special..."
          rows={6}
          style={{
            width: '100%',
            padding: sizing.control.padding,
            border: `1px solid ${statusColors.neutral300}`,
            borderRadius: radius.md,
            fontSize: sizing.control.fontSize,
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box'
          }}
        />
        <p style={{
          margin: `${spacing['3xs']} 0 0`,
          fontSize: typography.sizes.xs,
          color: statusColors.neutral500
        }}>
          Available for all vendors. This helps buyers learn about your business.
        </p>
      </div>

      {/* Social Links - Premium only */}
      <div>
        <h3 style={{
          margin: `${spacing.md} 0 ${spacing.sm}`,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          display: 'flex',
          alignItems: 'center',
          gap: spacing['2xs']
        }}>
          Website & Social Media
        </h3>

        <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral500, margin: `0 0 ${spacing.sm} 0` }}>
          Help customers find you online. Adding your website and social links builds trust and visibility.
        </p>

        <div style={{ display: 'grid', gap: spacing.sm }}>
          {/* Website */}
          <div>
            <label style={labelStyle}>Website</label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://yourwebsite.com"
              style={urlInputStyle}
            />
          </div>

          {/* Facebook */}
          <div>
            <label style={labelStyle}>Facebook Page</label>
            <input
              type="url"
              value={formData.facebook}
              onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
              placeholder="https://facebook.com/yourpage"
              style={urlInputStyle}
            />
          </div>

          {/* Instagram */}
          <div>
            <label style={labelStyle}>Instagram Profile</label>
            <input
              type="url"
              value={formData.instagram}
              onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
              placeholder="https://instagram.com/yourprofile"
              style={urlInputStyle}
            />
          </div>
        </div>
      </div>

      {/* Partner/Grant Code */}
      <div style={{ marginTop: spacing.md }}>
        <h3 style={{
          margin: `0 0 ${spacing.sm}`,
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
        }}>
          Partner / Grant Code
        </h3>
        <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral500, margin: `0 0 ${spacing.sm} 0` }}>
          If you received a partner or grant code, enter it here. Our team will verify and apply any applicable fee adjustments.
        </p>
        <input
          type="text"
          value={formData.fee_discount_code}
          onChange={(e) => setFormData({ ...formData, fee_discount_code: e.target.value })}
          placeholder="e.g. GRANT-2026-ABC"
          style={urlInputStyle}
        />
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: spacing.md,
          ...sizing.cta,
          fontWeight: typography.weights.semibold,
          backgroundColor: statusColors.info,
          color: 'white',
          border: 'none',
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.6 : 1
        }}
      >
        {saving ? 'Saving...' : 'Save Profile'}
      </button>

      {/* Message */}
      {message && (
        <p style={{
          marginTop: spacing.xs,
          padding: spacing.xs,
          backgroundColor: message.includes('success') ? colors.primaryLight : statusColors.dangerLight,
          color: message.includes('success') ? colors.primaryDark : statusColors.dangerDark,
          borderRadius: radius.sm,
          fontSize: typography.sizes.sm
        }}>
          {message}
        </p>
      )}
    </div>
  )
}
