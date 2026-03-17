'use client'

import { useEffect } from 'react'

export function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
    if (dsn) {
      import('@sentry/nextjs').then((Sentry) => {
        Sentry.init({
          dsn,
          tracesSampleRate: 0.1,
          replaysSessionSampleRate: 0,
          environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
        })
      })
    }
  }, [])

  return null
}
