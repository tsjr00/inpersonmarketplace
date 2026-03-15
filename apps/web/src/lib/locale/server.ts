import { cookies } from 'next/headers'
import { LOCALE_COOKIE, DEFAULT_LOCALE, isValidLocale } from './index'
import type { Locale } from './index'

/**
 * Read locale from cookie (server-side only — uses next/headers).
 * Returns DEFAULT_LOCALE if cookie is missing or invalid.
 */
export async function getLocale(): Promise<Locale> {
  try {
    const cookieStore = await cookies()
    const value = cookieStore.get(LOCALE_COOKIE)?.value
    if (value && isValidLocale(value)) return value
  } catch {
    // Outside of server component context (e.g. during build)
  }
  return DEFAULT_LOCALE
}
