import type { VerticalPlaceholders } from './types'

export function resolvePlaceholders(text: string, p: VerticalPlaceholders): string {
  let result = text
  result = result.replace(/\[PLATFORM_NAME\]/g, p.PLATFORM_NAME)
  result = result.replace(/\[PLATFORM_DOMAIN\]/g, p.PLATFORM_DOMAIN)
  result = result.replace(/\[VERTICAL_MARKET_TERM\]/g, p.VERTICAL_MARKET_TERM)
  result = result.replace(/\[VERTICAL_BOX_TERM\]/g, p.VERTICAL_BOX_TERM)
  result = result.replace(/\[VERTICAL_BOX_TYPES\]/g, p.VERTICAL_BOX_TYPES)
  result = result.replace(/\[GRACE_PERIOD\]/g, p.GRACE_PERIOD)
  result = result.replace(/\[SMALL_ORDER_THRESHOLD\]/g, p.SMALL_ORDER_THRESHOLD)
  result = result.replace(/\[SMALL_ORDER_FEE\]/g, p.SMALL_ORDER_FEE)
  result = result.replace(/\[VENDOR_TIERS\]/g, p.VENDOR_TIERS)

  if (p.TRIAL_TERMS === null) {
    // Remove sentences containing [TRIAL_TERMS] when not applicable
    result = result.replace(/[^.]*\[TRIAL_TERMS\][^.]*\.\s*/g, '')
  } else {
    result = result.replace(/\[TRIAL_TERMS\]/g, p.TRIAL_TERMS)
  }

  return result
}
