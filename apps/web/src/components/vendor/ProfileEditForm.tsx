'use client'
import { useState } from 'react'
import { colors } from '@/lib/design-tokens'
import { VendorTierType } from '@/lib/constants'

interface Props {
  vendorId: string
  currentData: {
    description?: string | null
    social_links?: Record<string, string> | null
  }
  tier: VendorTierType
}

export default function ProfileEditForm({ vendorId, currentData, tier }: Props) {
  const [formData, setFormData] = useState({
    description: currentData.description || '',
    facebook: currentData.social_links?.facebook || '',
    instagram: currentData.social_links?.instagram || '',
    website: currentData.social_links?.website || ''
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const isPremium = tier === 'premium' || tier === 'featured'

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
          social_links: isPremium ? {
            facebook: formData.facebook,
            instagram: formData.instagram,
            website: formData.website
          } : null
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

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: 12,
      padding: 24
    }}>
      <h2 style={{ marginBottom: 20, fontSize: 20, fontWeight: 600 }}>
        About Your Business
      </h2>

      {/* Description - Both tiers */}
      <div style={{ marginBottom: 20 }}>
        <label style={{
          display: 'block',
          marginBottom: 8,
          fontWeight: 600,
          fontSize: 14
        }}>
          Description
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Tell customers about your farm, your practices, what makes your products special..."
          rows={6}
          style={{
            width: '100%',
            padding: '12px',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box'
          }}
        />
        <p style={{
          margin: '4px 0 0',
          fontSize: 12,
          color: '#6b7280'
        }}>
          Available for all vendors. This helps buyers learn about your business.
        </p>
      </div>

      {/* Social Links - Premium only */}
      <div>
        <h3 style={{
          margin: '24px 0 16px',
          fontSize: 16,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          Social Media Links
          {isPremium ? (
            <span style={{
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: '#dbeafe',
              color: '#3b82f6',
              borderRadius: 8
            }}>
              Premium Feature
            </span>
          ) : (
            <span style={{
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 600,
              backgroundColor: '#f3f4f6',
              color: '#6b7280',
              borderRadius: 8
            }}>
              Upgrade to Premium
            </span>
          )}
        </h3>

        <div style={{ display: 'grid', gap: 16, opacity: isPremium ? 1 : 0.5 }}>
          {/* Facebook */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: 8,
              fontWeight: 600,
              fontSize: 14
            }}>
              Facebook Page
            </label>
            <input
              type="url"
              value={formData.facebook}
              onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
              placeholder="https://facebook.com/yourpage"
              disabled={!isPremium}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Instagram */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: 8,
              fontWeight: 600,
              fontSize: 14
            }}>
              Instagram Profile
            </label>
            <input
              type="url"
              value={formData.instagram}
              onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
              placeholder="https://instagram.com/yourprofile"
              disabled={!isPremium}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Website */}
          <div>
            <label style={{
              display: 'block',
              marginBottom: 8,
              fontWeight: 600,
              fontSize: 14
            }}>
              Website
            </label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://yourwebsite.com"
              disabled={!isPremium}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: 24,
          padding: '12px 32px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.6 : 1
        }}
      >
        {saving ? 'Saving...' : 'Save Profile'}
      </button>

      {/* Message */}
      {message && (
        <p style={{
          marginTop: 12,
          padding: 12,
          backgroundColor: message.includes('success') ? colors.primaryLight : '#fee2e2',
          color: message.includes('success') ? colors.primaryDark : '#991b1b',
          borderRadius: 6,
          fontSize: 14
        }}>
          {message}
        </p>
      )}
    </div>
  )
}
