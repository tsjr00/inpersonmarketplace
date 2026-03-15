import { en } from './en'
import { es } from './es'

const messages: Record<string, Record<string, string>> = { en, es }

/**
 * Translate a UI message key.
 * Supports {variable} interpolation: t('key', 'es', { city: 'Chicago' })
 * Falls back to English if key is missing in target locale.
 */
export function t(
  key: string,
  locale?: string,
  vars?: Record<string, string>
): string {
  const lang = locale || 'en'
  let msg = messages[lang]?.[key] ?? messages.en[key] ?? key

  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      msg = msg.replace(`{${k}}`, v)
    }
  }

  return msg
}
