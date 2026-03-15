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
