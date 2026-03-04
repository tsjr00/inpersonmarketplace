import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1, // 10% of transactions — free tier conscious
  replaysSessionSampleRate: 0, // no replays on free tier
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
  // Sentry is disabled when DSN env var is not set
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
})
