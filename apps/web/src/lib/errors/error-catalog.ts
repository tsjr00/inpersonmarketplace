/**
 * Error Catalog
 *
 * Aggregates all error definitions from domain-specific catalog files.
 * Provides lookup functions for error codes and PostgreSQL error codes.
 */

import { ErrorCatalogEntry } from './types'
import { AUTH_ERRORS } from './catalog/auth-errors'
import { RLS_ERRORS } from './catalog/rls-errors'
import { DB_ERRORS } from './catalog/db-errors'
import { CART_ERRORS } from './catalog/cart-errors'
import { ORDER_ERRORS, CHECKOUT_ERRORS } from './catalog/order-errors'
import { MARKET_BOX_ERRORS } from './catalog/market-box-errors'

/**
 * Complete error catalog - aggregates all error definitions
 */
export const ERROR_CATALOG: Map<string, ErrorCatalogEntry> = new Map([
  ...AUTH_ERRORS.map((e): [string, ErrorCatalogEntry] => [e.code, e]),
  ...RLS_ERRORS.map((e): [string, ErrorCatalogEntry] => [e.code, e]),
  ...DB_ERRORS.map((e): [string, ErrorCatalogEntry] => [e.code, e]),
  ...CART_ERRORS.map((e): [string, ErrorCatalogEntry] => [e.code, e]),
  ...ORDER_ERRORS.map((e): [string, ErrorCatalogEntry] => [e.code, e]),
  ...CHECKOUT_ERRORS.map((e): [string, ErrorCatalogEntry] => [e.code, e]),
  ...MARKET_BOX_ERRORS.map((e): [string, ErrorCatalogEntry] => [e.code, e]),
])

/**
 * Look up an error by its code
 */
export function lookupError(code: string): ErrorCatalogEntry | undefined {
  return ERROR_CATALOG.get(code)
}

/**
 * Look up error by PostgreSQL error code
 */
export function lookupByPgCode(pgCode: string): ErrorCatalogEntry | undefined {
  for (const [, entry] of ERROR_CATALOG) {
    if (entry.pgCodes?.includes(pgCode)) {
      return entry
    }
  }
  return undefined
}

/**
 * Get all errors in a category
 */
export function getErrorsByCategory(category: string): ErrorCatalogEntry[] {
  const errors: ErrorCatalogEntry[] = []
  for (const [, entry] of ERROR_CATALOG) {
    if (entry.category === category) {
      errors.push(entry)
    }
  }
  return errors
}

/**
 * Get all high/critical severity errors
 */
export function getCriticalErrors(): ErrorCatalogEntry[] {
  const errors: ErrorCatalogEntry[] = []
  for (const [, entry] of ERROR_CATALOG) {
    if (entry.severity === 'high' || entry.severity === 'critical') {
      errors.push(entry)
    }
  }
  return errors
}

/**
 * Developer utility: Explain an error code in the console
 * Call this from browser console: explainError('ERR_RLS_001')
 */
export function explainError(code: string): void {
  const entry = lookupError(code)

  if (!entry) {
    console.log(`Unknown error code: ${code}`)
    console.log('Available codes:', Array.from(ERROR_CATALOG.keys()).join(', '))
    return
  }

  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║ ${entry.code}: ${entry.title}
╠════════════════════════════════════════════════════════════════════╣
║ Category: ${entry.category}
║ Severity: ${entry.severity.toUpperCase()}
${entry.pgCodes?.length ? `║ PostgreSQL Codes: ${entry.pgCodes.join(', ')}` : ''}
╠════════════════════════════════════════════════════════════════════╣
║ Description:
║   ${entry.description}
╠════════════════════════════════════════════════════════════════════╣
║ Possible Causes:
${entry.causes.map((c) => `║   • ${c}`).join('\n')}
╠════════════════════════════════════════════════════════════════════╣
║ Solutions:
${entry.solutions.map((s) => `║   • ${s}`).join('\n')}
${entry.relatedCodes?.length ? `╠════════════════════════════════════════════════════════════════════╣\n║ Related Codes: ${entry.relatedCodes.join(', ')}` : ''}
╚════════════════════════════════════════════════════════════════════╝
`)
}

/**
 * Make explainError available globally in development
 */
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  ;(window as unknown as Record<string, unknown>).explainError = explainError
  ;(window as unknown as Record<string, unknown>).ERROR_CATALOG = ERROR_CATALOG
}
