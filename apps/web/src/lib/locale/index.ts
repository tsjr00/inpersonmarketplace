import { cookies } from 'next/headers'

export const SUPPORTED_LOCALES = ['en', 'es'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE = 'locale'

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
}

export function getLocaleLabel(locale: Locale): string {
  return LOCALE_LABELS[locale] ?? LOCALE_LABELS[DEFAULT_LOCALE]
}

export function isValidLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale)
}

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
