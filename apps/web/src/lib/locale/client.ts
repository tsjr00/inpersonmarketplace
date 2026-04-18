import { LOCALE_COOKIE, DEFAULT_LOCALE, isValidLocale } from './index'
import type { Locale } from './index'

/**
 * Read locale from cookie (client-side).
 * Parses document.cookie — no server dependency.
 */
export function getClientLocale(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE
  // Read the non-httpOnly client cookie (the httpOnly one is for server components only)
  const match = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${LOCALE_COOKIE}_client=`))
  const value = match?.split('=')[1]
  if (value && isValidLocale(value)) return value as Locale
  return DEFAULT_LOCALE
}

/**
 * Set locale via API route (sets httpOnly cookie server-side).
 * Reloads the page after setting so server components pick up the new value.
 */
export async function setClientLocale(locale: Locale): Promise<void> {
  try {
    const res = await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    })
    if (!res.ok) {
      console.error(`Locale switch failed: ${res.status}`)
    }
  } catch (err) {
    console.error('Locale switch fetch error:', err)
  }
  window.location.reload()
}
