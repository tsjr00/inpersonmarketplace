/**
 * External Payment Deep Link Generation
 *
 * Generates deep links for Venmo, Cash App, and PayPal that open
 * the payment app with amount pre-filled.
 */

export type ExternalPaymentMethod = 'venmo' | 'cashapp' | 'paypal' | 'cash'

/**
 * Generate a Venmo payment deep link
 * @param username - Venmo username (without @)
 * @param amount - Amount in dollars
 * @param orderNumber - Order number for the note
 * @returns Deep link URL
 */
export function generateVenmoLink(
  username: string,
  amount: number,
  orderNumber: string
): string {
  const note = encodeURIComponent(`Order ${orderNumber}`)
  // Clean username (remove @ if present)
  const cleanUsername = username.replace(/^@/, '')
  return `https://venmo.com/${cleanUsername}?txn=pay&amount=${amount.toFixed(2)}&note=${note}`
}

/**
 * Generate a Cash App payment deep link
 * @param cashtag - Cash App $cashtag (without $)
 * @param amount - Amount in dollars
 * @returns Deep link URL
 */
export function generateCashAppLink(
  cashtag: string,
  amount: number
): string {
  // Clean cashtag (remove $ if present)
  const cleanCashtag = cashtag.replace(/^\$/, '')
  return `https://cash.app/$${cleanCashtag}/${amount.toFixed(2)}`
}

/**
 * Generate a PayPal.me payment deep link
 * @param username - PayPal.me username
 * @param amount - Amount in dollars
 * @returns Deep link URL
 */
export function generatePayPalLink(
  username: string,
  amount: number
): string {
  return `https://paypal.me/${username}/${amount.toFixed(2)}USD`
}

/**
 * Generate the appropriate payment link based on method
 * @param method - Payment method
 * @param vendor - Vendor payment info
 * @param amount - Amount in dollars
 * @param orderNumber - Order number
 * @returns Deep link URL or null if method not configured
 */
export function generatePaymentLink(
  method: ExternalPaymentMethod,
  vendor: {
    venmo_username?: string | null
    cashapp_cashtag?: string | null
    paypal_username?: string | null
  },
  amount: number,
  orderNumber: string
): string | null {
  switch (method) {
    case 'venmo':
      if (!vendor.venmo_username) return null
      return generateVenmoLink(vendor.venmo_username, amount, orderNumber)

    case 'cashapp':
      if (!vendor.cashapp_cashtag) return null
      return generateCashAppLink(vendor.cashapp_cashtag, amount)

    case 'paypal':
      if (!vendor.paypal_username) return null
      return generatePayPalLink(vendor.paypal_username, amount)

    case 'cash':
      // Cash has no link - handled differently
      return null

    default:
      return null
  }
}

/**
 * Get available external payment methods for a vendor
 * @param vendor - Vendor payment info
 * @returns Array of available methods
 */
export function getAvailablePaymentMethods(vendor: {
  venmo_username?: string | null
  cashapp_cashtag?: string | null
  paypal_username?: string | null
  accepts_cash_at_pickup?: boolean | null
  stripe_account_id?: string | null
}): Array<{ method: ExternalPaymentMethod | 'stripe'; label: string }> {
  const methods: Array<{ method: ExternalPaymentMethod | 'stripe'; label: string }> = []

  // Stripe is always first if connected
  if (vendor.stripe_account_id) {
    methods.push({ method: 'stripe', label: 'Credit/Debit Card' })
  }

  if (vendor.venmo_username) {
    methods.push({ method: 'venmo', label: 'Venmo' })
  }

  if (vendor.cashapp_cashtag) {
    methods.push({ method: 'cashapp', label: 'Cash App' })
  }

  if (vendor.paypal_username) {
    methods.push({ method: 'paypal', label: 'PayPal' })
  }

  if (vendor.accepts_cash_at_pickup) {
    methods.push({ method: 'cash', label: 'Cash at Pickup' })
  }

  return methods
}

/**
 * Validate payment method username format
 */
export function validatePaymentUsername(
  method: ExternalPaymentMethod,
  value: string | null | undefined
): { valid: boolean; error?: string; cleaned: string } {
  // Handle null/undefined - empty is valid (means disabled)
  if (value === null || value === undefined) {
    return { valid: true, cleaned: '' }
  }

  const trimmed = value.trim()

  if (!trimmed) {
    return { valid: true, cleaned: '' } // Empty is valid (means disabled)
  }

  switch (method) {
    case 'venmo': {
      // Venmo: alphanumeric, dashes, underscores, 5-30 chars
      const cleaned = trimmed.replace(/^@/, '')
      if (!/^[a-zA-Z0-9_-]{5,30}$/.test(cleaned)) {
        return {
          valid: false,
          error: 'Venmo username must be 5-30 characters (letters, numbers, dashes, underscores)',
          cleaned
        }
      }
      return { valid: true, cleaned }
    }

    case 'cashapp': {
      // Cash App: alphanumeric only, 1-20 chars
      const cleaned = trimmed.replace(/^\$/, '')
      if (!/^[a-zA-Z0-9]{1,20}$/.test(cleaned)) {
        return {
          valid: false,
          error: 'Cash App tag must be 1-20 characters (letters and numbers only)',
          cleaned
        }
      }
      return { valid: true, cleaned }
    }

    case 'paypal': {
      // PayPal.me: alphanumeric, 3-20 chars
      if (!/^[a-zA-Z0-9]{3,20}$/.test(trimmed)) {
        return {
          valid: false,
          error: 'PayPal.me username must be 3-20 characters (letters and numbers only)',
          cleaned: trimmed
        }
      }
      return { valid: true, cleaned: trimmed }
    }

    default:
      return { valid: true, cleaned: trimmed }
  }
}
