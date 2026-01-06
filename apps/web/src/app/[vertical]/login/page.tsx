'use client'

import { useState, use, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { defaultBranding, VerticalBranding } from '@/lib/branding'

interface LoginPageProps {
  params: Promise<{ vertical: string }>
}

interface VerticalConfig {
  vertical_name_public?: string
  branding?: VerticalBranding
}

export default function LoginPage({ params }: LoginPageProps) {
  const { vertical } = use(params)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)
  const [branding, setBranding] = useState<VerticalBranding>(defaultBranding[vertical] || defaultBranding.fireworks)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch(`/api/vertical/${vertical}`)
        if (res.ok) {
          const cfg: VerticalConfig = await res.json()
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (data.user) {
      router.push(`/${vertical}/dashboard`)
      router.refresh()
    }
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

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: branding.colors.background,
      color: branding.colors.text,
      padding: 20
    }}>
      {/* Logo/Header */}
      <div style={{ textAlign: 'center', marginBottom: 40, paddingTop: 40 }}>
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

      {/* Login Form */}
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
          Login to Your Account
        </h2>

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

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 15 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
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

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
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
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: 'center', color: '#666' }}>
          Don&apos;t have an account?{' '}
          <Link href={`/${vertical}/signup`} style={{ color: branding.colors.primary, fontWeight: 600 }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
