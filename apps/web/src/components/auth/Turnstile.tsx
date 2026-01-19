'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

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

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: onVerify,
      'error-callback': () => onError?.(),
      'expired-callback': () => onExpire?.(),
      theme,
      size,
    })
  }, [onVerify, onError, onExpire, theme, size, siteKey])

  useEffect(() => {
    // If Turnstile is not configured, skip
    if (!siteKey) {
      console.warn('Turnstile site key not configured')
      return
    }

    // Check if script already loaded
    if (window.turnstile) {
      setIsLoaded(true)
      initWidget()
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

  const handleVerify = useCallback((newToken: string) => {
    setToken(newToken)
    setError(false)
  }, [])

  const handleError = useCallback(() => {
    setToken(null)
    setError(true)
  }, [])

  const handleExpire = useCallback(() => {
    setToken(null)
  }, [])

  const reset = useCallback(() => {
    setToken(null)
    setError(false)
  }, [])

  return {
    token,
    error,
    isVerified: !!token,
    handleVerify,
    handleError,
    handleExpire,
    reset,
  }
}
