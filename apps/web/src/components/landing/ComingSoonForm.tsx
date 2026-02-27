'use client'

import { useState } from 'react'

interface ComingSoonFormProps {
  vertical: string
}

interface FormData {
  businessName: string
  firstName: string
  lastName: string
  phone: string
  email: string
  socialLink: string
  website: string
  interestedInDemo: boolean
  questions: string
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  border: '1px solid #d0d0d0',
  borderRadius: '24px',
  fontSize: '14px',
  color: '#333',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  borderRadius: '16px',
  minHeight: '100px',
  resize: 'vertical',
}

const verticalLabels: Record<string, { businessName: string; website: string; facebook: string; accentColor: string }> = {
  food_trucks: {
    businessName: 'Food Truck Name',
    website: 'Food Truck Website (Optional)',
    facebook: 'https://www.facebook.com/foodtrucknapp/',
    accentColor: '#ff5757',
  },
  farmers_market: {
    businessName: 'Business Name',
    website: 'Business Website (Optional)',
    facebook: 'https://www.facebook.com/farmersmarketingapp/',
    accentColor: '#e86452',
  },
}

export function ComingSoonForm({ vertical }: ComingSoonFormProps) {
  const labels = verticalLabels[vertical] || verticalLabels.food_trucks
  const [form, setForm] = useState<FormData>({
    businessName: '',
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    socialLink: '',
    website: '',
    interestedInDemo: false,
    questions: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateField(field: keyof FormData, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError(null)

    if (
      !form.businessName.trim() ||
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.phone.trim() ||
      !form.email.trim()
    ) {
      setError('Please fill in all required fields.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Please enter a valid email address.')
      return
    }

    if (!/^[\d\s\-+().]{7,20}$/.test(form.phone)) {
      setError('Please enter a valid phone number.')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/vendor-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vertical,
          business_name: form.businessName.trim(),
          first_name: form.firstName.trim(),
          last_name: form.lastName.trim(),
          phone: form.phone.trim(),
          email: form.email.trim().toLowerCase(),
          social_link: form.socialLink.trim() || null,
          website: form.website.trim() || null,
          interested_in_demo: form.interestedInDemo,
          questions: form.questions.trim() || null,
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
          padding: '40px 24px',
        }}
      >
        <p style={{ fontSize: '16px', color: '#333', lineHeight: 1.6 }}>
          We received your submission and will be in touch with you soon. Please follow us on{' '}
          <a
            href={labels.facebook}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: labels.accentColor, fontWeight: 600, textDecoration: 'underline' }}
          >
            Facebook
          </a>{' '}
          to stay up to date with new announcements. Thank you!
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} id="signup-form">
      <p
        style={{
          fontSize: '14px',
          color: '#555',
          lineHeight: 1.6,
          marginBottom: '20px',
        }}
      >
        Complete the form below to apply to be listed on our app, to get more
        information or a free demo of all of the business features
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <input
          type="text"
          placeholder={labels.businessName}
          value={form.businessName}
          onChange={(e) => updateField('businessName', e.target.value)}
          style={inputStyle}
          required
        />

        <input
          type="text"
          placeholder="Owner First Name"
          value={form.firstName}
          onChange={(e) => updateField('firstName', e.target.value)}
          style={inputStyle}
          required
        />

        <input
          type="text"
          placeholder="Owner Last Name"
          value={form.lastName}
          onChange={(e) => updateField('lastName', e.target.value)}
          style={inputStyle}
          required
        />

        <input
          type="tel"
          placeholder="Phone Number"
          value={form.phone}
          onChange={(e) => updateField('phone', e.target.value)}
          style={inputStyle}
          required
        />

        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => updateField('email', e.target.value)}
          style={inputStyle}
          required
        />

        <input
          type="text"
          placeholder="Facebook or Instagram Link"
          value={form.socialLink}
          onChange={(e) => updateField('socialLink', e.target.value)}
          style={inputStyle}
        />

        <input
          type="text"
          placeholder={labels.website}
          value={form.website}
          onChange={(e) => updateField('website', e.target.value)}
          style={inputStyle}
        />

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
            color: '#333',
            cursor: 'pointer',
            padding: '4px 0',
          }}
        >
          <input
            type="checkbox"
            checked={form.interestedInDemo}
            onChange={(e) => updateField('interestedInDemo', e.target.checked)}
            style={{ width: '18px', height: '18px', accentColor: labels.accentColor }}
          />
          I am interested in seeing a demo
        </label>

        <textarea
          placeholder="Questions and/or more information on the features."
          value={form.questions}
          onChange={(e) => updateField('questions', e.target.value)}
          style={textareaStyle}
        />
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
          marginTop: '16px',
          padding: '14px 24px',
          backgroundColor: submitting ? '#ccc' : labels.accentColor,
          color: '#fff',
          border: 'none',
          borderRadius: '9999px',
          fontSize: '16px',
          fontWeight: 700,
          cursor: submitting ? 'not-allowed' : 'pointer',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        {submitting ? 'Submitting...' : 'Submit Form'}
      </button>
    </form>
  )
}
