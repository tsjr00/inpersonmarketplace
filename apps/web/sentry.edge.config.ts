import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  // L-9 FIX: Always trace cron routes (they run daily — 10% sampling misses most runs)
  tracesSampler: (samplingContext) => {
    const url = samplingContext.transactionContext?.name || ''
    if (url.includes('/api/cron/')) return 1.0
    if (url.includes('/api/health')) return 0.01
    return 0.1
  },
})
