/**
 * Centralized input validation utilities for formatted fields.
 * Used by forms that collect zip codes, phone numbers, and state abbreviations.
 */

/** Validate 5-digit or 5+4 ZIP code format */
export function isValidZip(zip: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(zip.trim())
}

/** Validate 10-digit US phone number (with or without formatting) */
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))
}

/** Validate 2-letter US state abbreviation */
export function isValidState(state: string): boolean {
  const STATES = new Set([
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY','DC','PR','VI','GU','AS','MP',
  ])
  return STATES.has(state.trim().toUpperCase())
}

/** Strip non-digits and truncate to 5 digits */
export function formatZip(zip: string): string {
  const digits = zip.replace(/\D/g, '')
  return digits.slice(0, 5)
}

/** Strip non-digits and format as (XXX) XXX-XXXX */
export function formatPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  // Strip leading 1 for US country code
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1)
  }
  if (digits.length !== 10) return phone // Return as-is if not valid
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

/** Normalize state to uppercase 2-letter code */
export function formatState(state: string): string {
  return state.trim().toUpperCase().slice(0, 2)
}
