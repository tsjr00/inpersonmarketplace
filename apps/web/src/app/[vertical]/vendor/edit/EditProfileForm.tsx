'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { VerticalBranding } from '@/lib/branding'
import { colors } from '@/lib/design-tokens'

interface VendorProfile {
  id: string
  user_id: string
  vertical_id: string
  status: string
  profile_data: Record<string, unknown>
  created_at: string
  updated_at: string
}

interface EditProfileFormProps {
  vertical: string
  vendorProfile: VendorProfile
  branding: VerticalBranding
}

export default function EditProfileForm({ vertical, vendorProfile, branding }: EditProfileFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const profileData = vendorProfile.profile_data as Record<string, unknown>

  const [formData, setFormData] = useState({
    legal_name: (profileData.legal_name as string) || '',
    phone: (profileData.phone as string) || '',
    email: (profileData.email as string) || '',
    business_name: (profileData.business_name as string) || (profileData.farm_name as string) || '',
  })
  const [multipleTrucks, setMultipleTrucks] = useState(!!profileData.multiple_trucks)
  // OB-031 option b (owner 2026-09-25): the days this vendor has picked that
  // overlap at two markets. Shown while the multi-location box is OFF — with it
  // off, booking a week at either of those markets is refused.
  type Overlap = { marketA: string; marketB: string; day: string; timeA: string; timeB: string }
  const [overlaps, setOverlaps] = useState<Overlap[]>([])
  useEffect(() => {
    let alive = true
    fetch(`/api/vendor/schedule-overlaps?vertical=${vertical}`)
      .then((r) => (r.ok ? r.json() : { overlaps: [] }))
      .then((d) => { if (alive) setOverlaps((d.overlaps ?? []) as Overlap[]) })
      .catch(() => { /* advisory only — no note on failure */ })
    return () => { alive = false }
  }, [vertical])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Merge new data with existing profile_data
    const updatedProfileData = {
      ...profileData,
      ...formData,
      multiple_trucks: multipleTrucks,
    }

    const { error } = await supabase
      .from('vendor_profiles')
      .update({
        profile_data: updatedProfileData,
        updated_at: new Date().toISOString()
      })
      .eq('id', vendorProfile.id)

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)

    // Clear success message after 3 seconds (no redirect - let user save other sections)
    setTimeout(() => {
      setSuccess(false)
    }, 3000)
  }

  return (
    <div style={{
      color: '#333'
    }}>
      {error && (
        <div style={{
          padding: 10,
          marginBottom: 12,
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: 4,
          color: '#c00'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: 10,
          marginBottom: 12,
          backgroundColor: colors.primaryLight,
          border: `1px solid ${colors.primary}`,
          borderRadius: 4,
          color: colors.primaryDark
        }}>
          Business information saved successfully!
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Legal Name */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
            Legal Name
          </label>
          <input
            type="text"
            name="legal_name"
            value={formData.legal_name}
            onChange={handleChange}
            required
            disabled={loading}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 15,
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Phone */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
            Phone Number
          </label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            required
            disabled={loading}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 15,
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Email */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
            Email Address
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            disabled={loading}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 15,
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Business Name */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
            Business Name
          </label>
          <input
            type="text"
            name="business_name"
            value={formData.business_name}
            onChange={handleChange}
            required
            disabled={loading}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 15,
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Multiple Trucks / multi-location checkbox — one profile flag
            (profile_data.multiple_trucks), two wordings. FM got it 2026-08-27
            (R3-4): "it's easier to set up a second table than a second food
            truck." Every conflict check (weekly schedules, park booking, the
            nightly quality scan, event acceptance) honors it in both verticals. */}
        {(
          <div style={{
            marginBottom: 12,
            padding: 12,
            backgroundColor: '#f9fafb',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={multipleTrucks}
                onChange={(e) => setMultipleTrucks(e.target.checked)}
                disabled={loading}
                style={{ width: 18, height: 18, marginTop: 2, accentColor: branding.colors.primary }}
              />
              <div>
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  {vertical === 'food_trucks'
                    ? 'I operate more than one truck/trailer simultaneously'
                    : 'I can staff more than one location at the same time'}
                </span>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#6b7280' }}>
                  {vertical === 'food_trucks'
                    ? 'When enabled, schedule overlap warnings are turned off since you can serve multiple locations at once. Accepting an event that overlaps another commitment will ask you to confirm you’ll cover both.'
                    : 'When enabled, overlapping schedules are allowed and accepting an event that overlaps a market day will ask you to confirm you’ll cover both. Leave it off if one team goes where you go — then taking an event pauses your other location for that day.'}
                </p>
              </div>
            </label>
            {!multipleTrucks && overlaps.length > 0 && (
              <div style={{
                marginTop: 10,
                padding: '10px 12px',
                backgroundColor: '#fffbeb',
                border: '1px solid #fcd34d',
                borderRadius: 6,
                fontSize: 13,
                color: '#92400e',
                lineHeight: 1.5,
              }}>
                <strong>With this box off, you&apos;re scheduled in two places at the same time:</strong>
                <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                  {overlaps.map((o, i) => (
                    <li key={i}>{o.marketA} ({o.timeA}) and {o.marketB} ({o.timeB}) on {o.day}</li>
                  ))}
                </ul>
                You won&apos;t be able to book booth weeks at those markets until you remove one of those days.{' '}
                <Link href={`/${vertical}/vendor/markets`} style={{ color: '#92400e', fontWeight: 600, textDecoration: 'underline' }}>
                  Change your days on your Markets page →
                </Link>
                {' '}Or tick the box if you really can staff both at once.
              </div>
            )}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 1,
              padding: '8px 16px',
              fontSize: 15,
              fontWeight: 600,
              backgroundColor: loading ? '#ccc' : branding.colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>

          <button
            type="button"
            onClick={() => router.push(`/${vertical}/vendor/dashboard`)}
            disabled={loading}
            style={{
              flex: 1,
              padding: '8px 16px',
              fontSize: 15,
              fontWeight: 600,
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
