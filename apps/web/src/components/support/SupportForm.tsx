'use client'

import { useState } from 'react'

interface SupportFormProps {
  vertical: string
}

interface FormData {
  name: string
  email: string
  category: string
  message: string
}

const categories = [
  { value: 'general', label: 'General Question' },
  { value: 'technical_problem', label: 'Technical Problem' },
  { value: 'order_issue', label: 'Order Issue' },
  { value: 'account_help', label: 'Account Help' },
  { value: 'feature_request', label: 'Feature Request' },
]

const verticalAccent: Record<string, string> = {
  food_trucks: '#ff5757',
  farmers_market: '#2d5016',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  border: '1px solid #d0d0d0',
  borderRadius: '8px',
  fontSize: '14px',
  color: '#333',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: '#555',
  marginBottom: '4px',
}

export function SupportForm({ vertical }: SupportFormProps) {
  const accent = verticalAccent[vertical] || verticalAccent.farmers_market
  const [form, setForm] = useState<FormData>({
    name: '',
    email: '',
    category: 'general',
    message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateField(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)

    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError('Please fill in all required fields.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Please enter a valid email address.')
      return
    }

    if (form.message.trim().length < 10) {
      setError('Please provide a bit more detail in your message.')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vertical,
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          category: form.category,
          message: form.message.trim(),
        }),
      })

      if (!res.ok) {
        const result = await res.json()
        setError(result.error || 'Submission failed. Please try again.')
        setSubmitting(false)
        return
      }

      setSubmitted(true)
    } catch {
      setError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '32px 24px',
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '12px',
        }}
      >
        <p style={{ fontSize: '16px', fontWeight: 600, color: '#166534', marginBottom: '8px' }}>
          Thank you!
        </p>
        <p style={{ fontSize: '14px', color: '#555', lineHeight: 1.6, margin: 0 }}>
          We&apos;ve received your message and will get back to you within 24-48 hours.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={labelStyle}>Name *</label>
          <input
            type="text"
            placeholder="Your name"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            style={inputStyle}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>Email *</label>
          <input
            type="email"
            placeholder="your@email.com"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            style={inputStyle}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>Category</label>
          <select
            value={form.category}
            onChange={(e) => updateField('category', e.target.value)}
            style={{
              ...inputStyle,
              backgroundColor: 'white',
              cursor: 'pointer',
            }}
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Message *</label>
          <textarea
            placeholder="Describe your issue or question..."
            value={form.message}
            onChange={(e) => updateField('message', e.target.value)}
            style={{
              ...inputStyle,
              minHeight: '120px',
              resize: 'vertical',
            }}
            required
          />
        </div>
      </div>

      {error && (
        <div
          style={{
            marginTop: '12px',
            padding: '10px 14px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#dc2626',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        style={{
          width: '100%',
          marginTop: '20px',
          padding: '14px 24px',
          backgroundColor: submitting ? '#ccc' : accent,
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '15px',
          fontWeight: 600,
          cursor: submitting ? 'not-allowed' : 'pointer',
        }}
      >
        {submitting ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  )
}
