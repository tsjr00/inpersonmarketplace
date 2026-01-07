'use client'

import { useState, use, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { defaultBranding, VerticalBranding } from '@/lib/branding'

interface ForgotPasswordPageProps {
  params: Promise<{ vertical: string }>
}

export default function ForgotPasswordPage({ params }: ForgotPasswordPageProps) {
  const { vertical } = use(params)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)
  const [branding, setBranding] = useState<VerticalBranding>(defaultBranding[vertical] || defaultBranding.fireworks)
  const supabase = createClient()

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch(`/api/vertical/${vertical}`)
        if (res.ok) {
          const cfg = await res.json()
          if (cfg.branding) {
            setBranding(cfg.branding)
          }
        }
      } catch (err) {
        console.error('Failed to load config:', err)
      } finally {
        setConfigLoading(false)
      }
    }
    loadConfig()
  }, [vertical])

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/${vertical}/reset-password`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (configLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: branding.colors.background,
        color: branding.colors.text
      }}>
        Loading...
      </div>
    )
  }

  if (success) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: branding.colors.background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}>
        <div style={{
          maxWidth: 400,
          padding: 30,
          backgroundColor: 'white',
          border: `2px solid ${branding.colors.accent}`,
          borderRadius: 8,
          textAlign: 'center',
          color: '#333'
        }}>
          <h2 style={{ color: branding.colors.accent, marginBottom: 20 }}>
            Check Your Email
          </h2>
          <p style={{ marginBottom: 20, color: '#666' }}>
            We&apos;ve sent a password reset link to <strong>{email}</strong>
          </p>
          <p style={{ marginBottom: 20, fontSize: 14, color: '#999' }}>
            The link will expire in 1 hour.
          </p>
          <Link
            href={`/${vertical}/login`}
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              backgroundColor: branding.colors.primary,
              color: 'white',
              textDecoration: 'none',
              borderRadius: 4,
              fontWeight: 600
            }}
          >
            Back to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: branding.colors.background,
      color: branding.colors.text
    }}>
      {/* Navigation */}
      <nav style={{
        padding: '15px 40px',
        borderBottom: `1px solid ${branding.colors.secondary}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Link href={`/${vertical}`} style={{ fontSize: 24, fontWeight: 'bold', color: branding.colors.primary, textDecoration: 'none' }}>
          {branding.brand_name}
        </Link>
        <Link href="/" style={{ color: branding.colors.secondary, textDecoration: 'none' }}>Home</Link>
      </nav>

      {/* Logo/Header */}
      <div style={{ textAlign: 'center', marginBottom: 40, paddingTop: 40, padding: 20 }}>
        <h1 style={{
          fontSize: 36,
          fontWeight: 'bold',
          color: branding.colors.primary,
          marginBottom: 10
        }}>
          {branding.brand_name}
        </h1>
        <p style={{ fontSize: 18, color: branding.colors.secondary }}>
          {branding.tagline}
        </p>
      </div>

      {/* Reset Form */}
      <div style={{
        maxWidth: 400,
        margin: '0 auto',
        padding: 30,
        backgroundColor: 'white',
        color: '#333',
        border: `2px solid ${branding.colors.primary}`,
        borderRadius: 8,
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{
          marginBottom: 20,
          color: branding.colors.primary,
          textAlign: 'center'
        }}>
          Reset Your Password
        </h2>

        <p style={{ marginBottom: 20, color: '#666', fontSize: 14 }}>
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>

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

        <form onSubmit={handleResetRequest}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              placeholder="your@email.com"
              style={{
                width: '100%',
                padding: 10,
                fontSize: 16,
                border: `1px solid ${branding.colors.primary}`,
                borderRadius: 4,
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: 12,
              fontSize: 16,
              fontWeight: 600,
              backgroundColor: loading ? '#ccc' : branding.colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: 15
            }}
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>

          <div style={{ textAlign: 'center' }}>
            <Link
              href={`/${vertical}/login`}
              style={{ color: branding.colors.secondary, fontSize: 14 }}
            >
              Back to Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
