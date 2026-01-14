'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Market {
  id: string
  name: string
  vertical_id: string
  type: 'traditional' | 'private_pickup'
  description?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  contact_email?: string
  contact_phone?: string
  active: boolean
}

interface MarketFormProps {
  market?: Market
  verticals: { vertical_id: string; name_public: string }[]
  mode: 'create' | 'edit'
}

export default function MarketForm({ market, verticals, mode }: MarketFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    name: market?.name || '',
    vertical_id: market?.vertical_id || (verticals[0]?.vertical_id || ''),
    type: market?.type || 'traditional',
    description: market?.description || '',
    address: market?.address || '',
    city: market?.city || '',
    state: market?.state || '',
    zip: market?.zip || '',
    contact_email: market?.contact_email || '',
    contact_phone: market?.contact_phone || '',
    active: market?.active ?? true,
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const url = mode === 'create' ? '/api/markets' : `/api/markets/${market?.id}`
      const method = mode === 'create' ? 'POST' : 'PATCH'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong')
      }

      if (mode === 'create') {
        router.push(`/admin/markets/${data.market.id}`)
      } else {
        router.push('/admin/markets')
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid #ddd',
    borderRadius: 8,
    fontSize: 14,
    boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    display: 'block',
    marginBottom: 6,
    fontSize: 14,
    fontWeight: 500 as const,
    color: '#333',
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 600 }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}>
        {/* Basic Info */}
        <h3 style={{ margin: '0 0 20px 0', fontSize: 16, fontWeight: 600, color: '#333' }}>
          Basic Information
        </h3>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Market Name *</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            style={inputStyle}
            placeholder="e.g., Downtown Farmers Market"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Vertical *</label>
            <select
              name="vertical_id"
              value={formData.vertical_id}
              onChange={handleChange}
              required
              disabled={mode === 'edit'}
              style={{ ...inputStyle, backgroundColor: mode === 'edit' ? '#f5f5f5' : 'white' }}
            >
              {verticals.map(v => (
                <option key={v.vertical_id} value={v.vertical_id}>{v.name_public}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Market Type *</label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              required
              style={inputStyle}
            >
              <option value="traditional">Traditional (Farmers Market)</option>
              <option value="private_pickup">Private Pickup</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
            placeholder="Brief description of the market..."
          />
        </div>

        {/* Location */}
        <h3 style={{ margin: '24px 0 20px 0', fontSize: 16, fontWeight: 600, color: '#333', paddingTop: 20, borderTop: '1px solid #eee' }}>
          Location
        </h3>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Street Address</label>
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleChange}
            style={inputStyle}
            placeholder="123 Main St"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>City</label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>State</label>
            <input
              type="text"
              name="state"
              value={formData.state}
              onChange={handleChange}
              style={inputStyle}
              maxLength={2}
              placeholder="CA"
            />
          </div>

          <div>
            <label style={labelStyle}>ZIP</label>
            <input
              type="text"
              name="zip"
              value={formData.zip}
              onChange={handleChange}
              style={inputStyle}
              maxLength={10}
            />
          </div>
        </div>

        {/* Contact */}
        <h3 style={{ margin: '24px 0 20px 0', fontSize: 16, fontWeight: 600, color: '#333', paddingTop: 20, borderTop: '1px solid #eee' }}>
          Contact Information
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>Contact Email</label>
            <input
              type="email"
              name="contact_email"
              value={formData.contact_email}
              onChange={handleChange}
              style={inputStyle}
              placeholder="market@example.com"
            />
          </div>

          <div>
            <label style={labelStyle}>Contact Phone</label>
            <input
              type="tel"
              name="contact_phone"
              value={formData.contact_phone}
              onChange={handleChange}
              style={inputStyle}
              placeholder="(555) 555-5555"
            />
          </div>
        </div>

        {/* Status */}
        {mode === 'edit' && (
          <div style={{ marginBottom: 20, paddingTop: 20, borderTop: '1px solid #eee' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                name="active"
                checked={formData.active}
                onChange={handleChange}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontSize: 14, fontWeight: 500, color: '#333' }}>
                Market is Active
              </span>
            </label>
            <p style={{ margin: '8px 0 0 28px', fontSize: 13, color: '#666' }}>
              Inactive markets are hidden from public view
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#f8d7da',
            color: '#721c24',
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 14,
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px 24px',
              backgroundColor: loading ? '#ccc' : '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Saving...' : mode === 'create' ? 'Create Market' : 'Save Changes'}
          </button>

          <button
            type="button"
            onClick={() => router.back()}
            style={{
              padding: '12px 24px',
              backgroundColor: '#f0f0f0',
              color: '#333',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  )
}
