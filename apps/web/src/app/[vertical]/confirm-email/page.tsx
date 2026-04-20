'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { colors, spacing, typography, radius } from '@/lib/design-tokens'

interface ConfirmEmailPageProps {
  params: Promise<{ vertical: string }>
}

export default function ConfirmEmailPage({ params }: ConfirmEmailPageProps) {
  const { vertical } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    async function confirmEmail() {
      const searchParams = new URLSearchParams(window.location.search)
      const tokenHash = searchParams.get('token_hash')
      const type = searchParams.get('type')

      if (!tokenHash || !type) {
        setStatus('error')
        setErrorMessage('Invalid confirmation link. Please request a new one.')
        return
      }

      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as 'signup' | 'email',
      })

      if (error) {
        setStatus('error')
        setErrorMessage(
          error.message.includes('expired')
            ? 'This confirmation link has expired. Please sign up again or request a new link.'
            : `Confirmation failed: ${error.message}`
        )
        return
      }

      setStatus('success')

      // Read redirect destination from user metadata (saved by signup page)
      // Covers: vendors → /vendor-signup, event organizers → /dashboard?section=events, buyers → /dashboard
      const { data: { user } } = await supabase.auth.getUser()
      const redirectTo = user?.user_metadata?.signup_redirect_to as string | undefined

      // Redirect after brief success message
      setTimeout(() => {
        router.push(redirectTo || `/${vertical}/dashboard`)
        router.refresh()
      }, 2000)
    }

    confirmEmail()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceBase,
      padding: spacing.lg,
    }}>
      <div style={{
        maxWidth: 420,
        width: '100%',
        textAlign: 'center',
        backgroundColor: 'white',
        borderRadius: radius.lg,
        padding: spacing.xl,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        {status === 'verifying' && (
          <>
            <div style={{ fontSize: 48, marginBottom: spacing.sm }}>&#9203;</div>
            <h1 style={{ fontSize: typography.sizes.xl, margin: `0 0 ${spacing.xs}`, color: colors.textSecondary }}>
              Confirming your email...
            </h1>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: 0 }}>
              Please wait a moment.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: 48, marginBottom: spacing.sm }}>&#10003;</div>
            <h1 style={{ fontSize: typography.sizes.xl, margin: `0 0 ${spacing.xs}`, color: '#166534' }}>
              Email confirmed!
            </h1>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: 0 }}>
              Your account is ready. Redirecting to your dashboard...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: 48, marginBottom: spacing.sm }}>&#10007;</div>
            <h1 style={{ fontSize: typography.sizes.xl, margin: `0 0 ${spacing.xs}`, color: '#991b1b' }}>
              Confirmation failed
            </h1>
            <p style={{ fontSize: typography.sizes.sm, color: colors.textMuted, margin: `0 0 ${spacing.md}` }}>
              {errorMessage}
            </p>
            <a
              href={`/${vertical}/signup`}
              style={{
                display: 'inline-block',
                padding: `${spacing['2xs']} ${spacing.md}`,
                backgroundColor: colors.primary,
                color: 'white',
                textDecoration: 'none',
                borderRadius: radius.sm,
                fontWeight: typography.weights.semibold,
                fontSize: typography.sizes.sm,
              }}
            >
              Back to Sign Up
            </a>
          </>
        )}
      </div>
    </div>
  )
}
