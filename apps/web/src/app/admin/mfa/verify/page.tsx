'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function MFAVerifyPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [factorId, setFactorId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function checkMFAStatus() {
      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/admin/login')
        return
      }

      // Check current assurance level
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

      if (aal?.currentLevel === 'aal2') {
        // Already fully authenticated
        router.push('/admin')
        return
      }

      // Get the TOTP factor
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totpFactor = factors?.totp?.find(f => f.status === 'verified')

      if (!totpFactor) {
        // No MFA set up, redirect to setup
        router.push('/admin/mfa/setup')
        return
      }

      setFactorId(totpFactor.id)
      setLoading(false)
    }

    checkMFAStatus()
  }, [supabase, router])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId) return

    setVerifying(true)
    setError('')

    try {
      // Create a challenge
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId
      })

      if (challengeError) {
        setError(challengeError.message)
        setVerifying(false)
        return
      }

      // Verify the code
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code
      })

      if (verifyError) {
        setError('Invalid code. Please try again.')
        setVerifying(false)
        return
      }

      // Success - redirect to admin
      router.push('/admin')
      router.refresh()
    } catch (err) {
      setError('Verification failed. Please try again.')
      setVerifying(false)
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a1a2e'
      }}>
        <div style={{ color: 'white', fontSize: 18 }}>Loading...</div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#1a1a2e'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: 40,
        borderRadius: 12,
        width: '100%',
        maxWidth: 400
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 60,
            height: 60,
            backgroundColor: '#f0f9ff',
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16
          }}>
            <span style={{ fontSize: 28 }}>🔐</span>
          </div>
        </div>

        <h1 style={{
          color: '#333',
          marginBottom: 10,
          fontSize: 24,
          textAlign: 'center'
        }}>
          Two-Factor Authentication
        </h1>
        <p style={{
          color: '#666',
          marginBottom: 30,
          fontSize: 14,
          textAlign: 'center'
        }}>
          Enter the 6-digit code from your authenticator app
        </p>

        {error && (
          <div style={{
            padding: 12,
            backgroundColor: '#fee',
            color: '#c00',
            borderRadius: 6,
            marginBottom: 20,
            fontSize: 14,
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleVerify}>
          <div style={{ marginBottom: 24 }}>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              required
              maxLength={6}
              pattern="\d{6}"
              autoComplete="one-time-code"
              autoFocus
              style={{
                width: '100%',
                padding: 16,
                borderRadius: 6,
                border: '1px solid #ddd',
                fontSize: 28,
                textAlign: 'center',
                letterSpacing: 12,
                fontFamily: 'monospace',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={verifying || code.length !== 6}
            style={{
              width: '100%',
              padding: 14,
              backgroundColor: verifying || code.length !== 6 ? '#ccc' : '#333',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 16,
              fontWeight: 600,
              cursor: verifying || code.length !== 6 ? 'not-allowed' : 'pointer'
            }}
          >
            {verifying ? 'Verifying...' : 'Verify'}
          </button>
        </form>

        <div style={{
          marginTop: 24,
          textAlign: 'center'
        }}>
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              router.push('/admin/login')
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#666',
              fontSize: 14,
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            Sign out and use a different account
          </button>
        </div>
      </div>
    </div>
  )
}
