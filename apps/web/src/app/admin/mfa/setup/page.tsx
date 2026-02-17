'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { colors } from '@/lib/design-tokens'

export default function MFASetupPage() {
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [enrolled, setEnrolled] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function checkAndEnroll() {
      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/admin/login')
        return
      }

      // Check if MFA is already set up
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totpFactor = factors?.totp?.find(f => f.status === 'verified')

      if (totpFactor) {
        // Already enrolled, redirect to admin
        router.push('/admin')
        return
      }

      // Start enrollment (or re-enroll if there was an unverified factor)
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Admin Authenticator'
      })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
      setFactorId(data.id)

      setLoading(false)
    }

    checkAndEnroll()
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
        code: verifyCode
      })

      if (verifyError) {
        setError('Invalid code. Please try again.')
        setVerifying(false)
        return
      }

      setEnrolled(true)

      // Redirect to admin after short delay
      setTimeout(() => {
        router.push('/admin')
        router.refresh()
      }, 1500)
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

  if (enrolled) {
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
          maxWidth: 400,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>✓</div>
          <h1 style={{ color: colors.primary, marginBottom: 10 }}>MFA Enabled!</h1>
          <p style={{ color: '#666' }}>Redirecting to admin panel...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#1a1a2e',
      padding: 20
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: 40,
        borderRadius: 12,
        width: '100%',
        maxWidth: 450
      }}>
        <h1 style={{ color: '#333', marginBottom: 10, fontSize: 24 }}>
          Set Up Two-Factor Authentication
        </h1>
        <p style={{ color: '#666', marginBottom: 30, fontSize: 14 }}>
          Admin accounts require MFA for security. Scan the QR code with your authenticator app.
        </p>

        {error && (
          <div style={{
            padding: 12,
            backgroundColor: '#fee',
            color: '#c00',
            borderRadius: 6,
            marginBottom: 20,
            fontSize: 14
          }}>
            {error}
          </div>
        )}

        {qrCode && (
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
            <div style={{
              display: 'inline-block',
              padding: 16,
              backgroundColor: 'white',
              border: '1px solid #eee',
              borderRadius: 8
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrCode}
                alt="QR Code for authenticator app"
                style={{ width: 200, height: 200 }}
              />
            </div>

            {secret && (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                  Can&apos;t scan? Enter this code manually:
                </p>
                <code style={{
                  display: 'block',
                  padding: 10,
                  backgroundColor: '#f5f5f5',
                  borderRadius: 4,
                  fontSize: 12,
                  wordBreak: 'break-all',
                  fontFamily: 'monospace'
                }}>
                  {secret}
                </code>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleVerify}>
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block',
              marginBottom: 8,
              color: '#333',
              fontWeight: 600,
              fontSize: 14
            }}>
              Enter the 6-digit code from your app
            </label>
            <input
              type="text"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              required
              maxLength={6}
              pattern="\d{6}"
              autoComplete="one-time-code"
              style={{
                width: '100%',
                padding: 16,
                borderRadius: 6,
                border: '1px solid #ddd',
                fontSize: 24,
                textAlign: 'center',
                letterSpacing: 8,
                fontFamily: 'monospace',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={verifying || verifyCode.length !== 6}
            style={{
              width: '100%',
              padding: 14,
              backgroundColor: verifying || verifyCode.length !== 6 ? '#ccc' : '#333',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: 16,
              fontWeight: 600,
              cursor: verifying || verifyCode.length !== 6 ? 'not-allowed' : 'pointer'
            }}
          >
            {verifying ? 'Verifying...' : 'Verify & Enable MFA'}
          </button>
        </form>

        <div style={{
          marginTop: 30,
          padding: 16,
          backgroundColor: '#f0f9ff',
          borderRadius: 8,
          fontSize: 13,
          color: '#0369a1'
        }}>
          <strong>Recommended authenticator apps:</strong>
          <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
            <li>Google Authenticator</li>
            <li>Microsoft Authenticator</li>
            <li>Authy</li>
            <li>1Password</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
