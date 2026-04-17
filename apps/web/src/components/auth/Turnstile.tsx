'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

const TURNSTILE_TIMEOUT_MS = 10_000 // Enable form after 10s if widget doesn't verify

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          'error-callback': () => void
          'expired-callback': () => void
          theme?: 'light' | 'dark' | 'auto'
          size?: 'normal' | 'compact'
        }
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
    onTurnstileLoad?: () => void
  }
}

interface TurnstileProps {
  onVerify: (token: string) => void
  onError?: () => void
  onExpire?: () => void
  theme?: 'light' | 'dark' | 'auto'
  size?: 'normal' | 'compact'
}

export function Turnstile({
  onVerify,
  onError,
  onExpire,
  theme = 'auto',
  size = 'normal',
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  const initWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || !siteKey) return
    if (widgetIdRef.current) return // Already initialized

    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onVerify,
        'error-callback': () => onError?.(),
        'expired-callback': () => onExpire?.(),
        theme,
        size,
      })
    } catch (err) {
      console.error('[Turnstile] Widget render failed:', err)
      onError?.()
    }
  }, [onVerify, onError, onExpire, theme, size, siteKey])

  useEffect(() => {
    // If Turnstile is not configured, skip
    if (!siteKey) {
      console.warn('Turnstile site key not configured')
      return
    }

    // Check if script already loaded
    if (window.turnstile) {
      // Use queueMicrotask to avoid synchronous setState in effect body
      queueMicrotask(() => { setIsLoaded(true); initWidget() })
      return
    }

    // Check if script is already loading
    const existingScript = document.querySelector(
      'script[src*="challenges.cloudflare.com/turnstile"]'
    )

    if (existingScript) {
      // Wait for existing script to load
      window.onTurnstileLoad = () => {
        setIsLoaded(true)
        initWidget()
      }
      return
    }

    // Load script
    window.onTurnstileLoad = () => {
      setIsLoaded(true)
      initWidget()
    }

    const script = document.createElement('script')
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
    script.async = true
    script.defer = true
    script.onerror = () => {
      console.error('[Turnstile] Failed to load Cloudflare script — CDN unreachable or blocked')
      onError?.()
    }
    document.head.appendChild(script)

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [siteKey, initWidget])

  useEffect(() => {
    if (isLoaded) {
      initWidget()
    }
  }, [isLoaded, initWidget])

  // Don't render if not configured
  if (!siteKey) {
    return null
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        justifyContent: 'center',
        marginTop: '1rem',
        marginBottom: '1rem',
      }}
    />
  )
}

export function useTurnstile() {
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const tokenRef = useRef<string | null>(null)

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  // Timeout: if widget doesn't verify within 10s, allow form submission.
  // The real security gate is Supabase's server-side CAPTCHA check —
  // this timeout only affects the UI button state, not server validation.
  useEffect(() => {
    if (!siteKey) return
    const timer = setTimeout(() => {
      if (!tokenRef.current) {
        setTimedOut(true)
        console.warn('[Turnstile] Widget did not verify within 10 seconds — enabling form submission')
      }
    }, TURNSTILE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [siteKey])

  const handleVerify = useCallback((newToken: string) => {
    setToken(newToken)
    tokenRef.current = newToken
    setError(false)
  }, [])

  const handleError = useCallback(() => {
    setToken(null)
    tokenRef.current = null
    setError(true)
  }, [])

  const handleExpire = useCallback(() => {
    setToken(null)
    tokenRef.current = null
  }, [])

  const reset = useCallback(() => {
    setToken(null)
    tokenRef.current = null
    setError(false)
  }, [])

  return {
    token,
    error,
    timedOut,
    isVerified: !!token || timedOut,
    handleVerify,
    handleError,
    handleExpire,
    reset,
  }
}
