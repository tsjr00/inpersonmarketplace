'use client'

import { useState } from 'react'
import { spacing, typography, radius, sizing, statusColors } from '@/lib/design-tokens'
import { getClientLocale } from '@/lib/locale/client'
import { t } from '@/lib/locale/messages'

interface SupportFormProps {
  vertical: string
}

interface FormData {
  name: string
  email: string
  category: string
  message: string
}

const verticalAccent: Record<string, string> = {
  food_trucks: '#ff5757',
  farmers_market: '#2d5016',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: sizing.control.padding,
  border: `1px solid ${statusColors.neutral300}`,
  borderRadius: radius.md,
  fontSize: sizing.control.fontSize,
  minHeight: sizing.control.minHeight,
  color: statusColors.neutral800,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: typography.sizes.xs,
  fontWeight: typography.weights.semibold,
  color: statusColors.neutral600,
  marginBottom: spacing['3xs'],
}

export function SupportForm({ vertical }: SupportFormProps) {
  const accent = verticalAccent[vertical] || verticalAccent.farmers_market
  const locale = getClientLocale()
  const localCategories = [
    { value: 'general', label: t('support_form.cat_general', locale) },
    { value: 'technical_problem', label: t('support_form.cat_technical', locale) },
    { value: 'order_issue', label: t('support_form.cat_order', locale) },
    { value: 'account_help', label: t('support_form.cat_account', locale) },
    { value: 'feature_request', label: t('support_form.cat_feature', locale) },
  ]
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
      setError(t('support_form.fill_required', locale))
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError(t('support_form.invalid_email', locale))
      return
    }

    if (form.message.trim().length < 10) {
      setError(t('support_form.more_detail', locale))
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
        setError(result.error || t('support_form.submit_failed', locale))
        setSubmitting(false)
        return
      }

      setSubmitted(true)
    } catch {
      setError(t('support_form.network_error', locale))
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: `${spacing.lg} ${spacing.md}`,
          backgroundColor: statusColors.successLight,
          border: `1px solid ${statusColors.successBorder}`,
          borderRadius: radius.lg,
        }}
      >
        <p style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: '#166534', marginBottom: spacing['2xs'] }}>
          {t('support_form.thank_you', locale)}
        </p>
        <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral600, lineHeight: 1.6, margin: 0 }}>
          {t('support_form.thank_you_msg', locale)}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
        <div>
          <label style={labelStyle}>{t('support_form.name', locale)}</label>
          <input
            type="text"
            placeholder={t('support_form.name_placeholder', locale)}
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            style={inputStyle}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>{t('support_form.email', locale)}</label>
          <input
            type="email"
            placeholder={t('support_form.email_placeholder', locale)}
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            style={inputStyle}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>{t('support_form.category', locale)}</label>
          <select
            value={form.category}
            onChange={(e) => updateField('category', e.target.value)}
            style={{
              ...inputStyle,
              backgroundColor: 'white',
              cursor: 'pointer',
            }}
          >
            {localCategories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>{t('support_form.message', locale)}</label>
          <textarea
            placeholder={t('support_form.message_placeholder', locale)}
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
            marginTop: spacing.xs,
            padding: `${spacing['2xs']} ${spacing.xs}`,
            backgroundColor: statusColors.dangerLight,
            border: `1px solid ${statusColors.dangerBorder}`,
            borderRadius: radius.md,
            color: statusColors.danger,
            fontSize: typography.sizes.xs,
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
          marginTop: spacing.md,
          ...sizing.cta,
          fontWeight: typography.weights.semibold,
          backgroundColor: submitting ? '#ccc' : accent,
          color: '#fff',
          border: 'none',
          cursor: submitting ? 'not-allowed' : 'pointer',
        }}
      >
        {submitting ? t('support_form.submitting', locale) : t('support_form.submit', locale)}
      </button>
    </form>
  )
}
