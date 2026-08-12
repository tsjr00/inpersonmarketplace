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
      // split/join, NOT replace or replaceAll — two separate reasons (T-42).
      //
      // 1. `String.replace` with a STRING pattern substitutes only the FIRST
      //    occurrence. Five messages across en + es repeat a token, so they
      //    rendered half-filled: `notif.order_placed_msg` emailed buyers the
      //    literal text "confirmed by {vendorName}", and the Spanish
      //    `markets.found` / `markets.found_within` lost their {s} plural
      //    suffix. Found by owner testing 2026-08-11.
      //
      // 2. `replaceAll` would fix the first problem and introduce a worse one:
      //    with a string replacement it still interprets $&, $', $` and $1 in
      //    the REPLACEMENT. These values are user data — a vendor named
      //    "Bob's $5 Tacos" would corrupt the message. split/join treats the
      //    value as a literal, always.
      msg = msg.split(`{${k}}`).join(v)
    }
  }

  return msg
}
