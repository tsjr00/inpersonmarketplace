'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { VerticalBranding } from '@/lib/branding'

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
      ...formData
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

    // Redirect back to dashboard after 1 second
    setTimeout(() => {
      router.push(`/${vertical}/vendor/dashboard`)
    }, 1000)
  }

  if (success) {
    return (
      <div style={{
        padding: 30,
        backgroundColor: 'white',
        border: '2px solid ' + branding.colors.accent,
        borderRadius: 8,
        textAlign: 'center',
        color: '#333',
        maxWidth: 600,
        margin: '0 auto'
      }}>
        <h2 style={{ color: branding.colors.accent }}>Profile Updated!</h2>
        <p>Redirecting to dashboard...</p>
      </div>
    )
  }

  return (
    <div style={{
      maxWidth: 600,
      margin: '0 auto',
      padding: 30,
      backgroundColor: 'white',
      border: '1px solid ' + branding.colors.secondary,
      borderRadius: 8,
      color: '#333'
    }}>
      {error && (
        <div style={{
          padding: 10,
          marginBottom: 20,
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: 4,
          color: '#c00'
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Legal Name */}
        <div style={{ marginBottom: 20 }}>
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
              padding: 10,
              fontSize: 16,
              border: '1px solid ' + branding.colors.primary,
              borderRadius: 4,
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Phone */}
        <div style={{ marginBottom: 20 }}>
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
              padding: 10,
              fontSize: 16,
              border: '1px solid ' + branding.colors.primary,
              borderRadius: 4,
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Email */}
        <div style={{ marginBottom: 20 }}>
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
              padding: 10,
              fontSize: 16,
              border: '1px solid ' + branding.colors.primary,
              borderRadius: 4,
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Business Name */}
        <div style={{ marginBottom: 20 }}>
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
              padding: 10,
              fontSize: 16,
              border: '1px solid ' + branding.colors.primary,
              borderRadius: 4,
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 30 }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 1,
              padding: 12,
              fontSize: 16,
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
              padding: 12,
              fontSize: 16,
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
