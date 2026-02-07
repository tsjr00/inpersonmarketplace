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
