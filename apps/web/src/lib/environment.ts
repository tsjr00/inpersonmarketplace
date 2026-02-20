/**
 * Returns the app's base URL for the current environment.
 *
 * Resolution order:
 * 1. NEXT_PUBLIC_APP_URL (explicitly set per environment)
 * 2. NEXT_PUBLIC_VERCEL_URL (auto-provided by Vercel — preview deployments)
 * 3. http://localhost:3002 (local dev fallback)
 */
export function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
  }
  return 'http://localhost:3002'
}

const REQUIRED_SERVER_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'CRON_SECRET',
] as const

const OPTIONAL_SERVER_ENV: Record<string, string> = {
  RESEND_API_KEY: 'Email notifications disabled',
  TWILIO_ACCOUNT_SID: 'SMS notifications disabled',
  VAPID_PRIVATE_KEY: 'Push notifications disabled',
}

/**
 * Validates required environment variables on server startup.
 * Called from Next.js instrumentation hook.
 */
export function validateEnv() {
  const missing = REQUIRED_SERVER_ENV.filter(key => !process.env[key])
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
  for (const [key, message] of Object.entries(OPTIONAL_SERVER_ENV)) {
    if (!process.env[key]) {
      console.warn(`[env] ${key} not set — ${message}`)
    }
  }
}
