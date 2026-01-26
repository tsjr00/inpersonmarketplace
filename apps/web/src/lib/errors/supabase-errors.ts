/**
 * Supabase Error Parser
 *
 * Parses Supabase/PostgreSQL errors into TracedErrors with appropriate
 * error codes and context. Maps PostgreSQL error codes to our internal
 * error code system.
 */

import { ErrorContext, SupabaseError } from './types'
import { TracedError } from './traced-error'

/**
 * PostgreSQL error code to internal error code mapping
 *
 * Reference: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const PG_CODE_MAP: Record<string, { code: string; message: string }> = {
  // RLS / Permission errors
  '42P17': { code: 'ERR_RLS_001', message: 'RLS policy recursion detected' },
  '42501': { code: 'ERR_RLS_002', message: 'Access denied by RLS policy' },

  // Integrity constraint violations
  '23503': { code: 'ERR_DB_001', message: 'Referenced record not found' },
  '23505': { code: 'ERR_DB_002', message: 'Record already exists' },
  '23502': { code: 'ERR_DB_003', message: 'Required field is missing' },
  '23514': { code: 'ERR_DB_004', message: 'Value violates check constraint' },

  // Schema errors
  '42703': { code: 'ERR_DB_010', message: 'Invalid column reference' },
  '42883': { code: 'ERR_DB_011', message: 'Database function not found' },
  '42P01': { code: 'ERR_DB_012', message: 'Table not found' },

  // Data errors
  '22P02': { code: 'ERR_DB_020', message: 'Invalid data format' },
  '22003': { code: 'ERR_DB_021', message: 'Numeric value out of range' },

  // PostgREST specific
  PGRST116: { code: 'ERR_DB_030', message: 'No rows returned' },
  PGRST301: { code: 'ERR_DB_031', message: 'Row count limit exceeded' },
}

/**
 * Convert a Supabase error to a TracedError
 */
export function parseSupabaseError(
  error: SupabaseError,
  context?: Partial<ErrorContext>
): TracedError {
  const pgCode = error.code
  const mapping = pgCode ? PG_CODE_MAP[pgCode] : null

  const errorCode = mapping?.code || 'ERR_DB_UNKNOWN'
  const message = mapping?.message || error.message

  // Try to extract additional context from error
  const table = context?.table || extractTableFromError(error)
  const policyName = extractPolicyFromError(error)

  return new TracedError(errorCode, message, {
    ...context,
    table,
    policyName,
    pgCode: pgCode || undefined,
    pgDetail: error.details || undefined,
    pgHint: error.hint || undefined,
    originalError: error,
  })
}

/**
 * Extract table name from error message (heuristic)
 */
export function extractTableFromError(error: SupabaseError): string | undefined {
  if (!error.message) return undefined

  // Pattern: "on table "tablename"" or "relation "tablename""
  const tableMatch = error.message.match(/(?:table|relation)\s+"([^"]+)"/)
  if (tableMatch) return tableMatch[1]

  // Pattern: "policy for relation "tablename""
  const policyMatch = error.message.match(/policy for relation\s+"([^"]+)"/)
  if (policyMatch) return policyMatch[1]

  return undefined
}

/**
 * Extract policy name from RLS error (when available)
 */
export function extractPolicyFromError(error: SupabaseError): string | undefined {
  if (!error.details && !error.message) return undefined

  // Pattern: "policy "policyname""
  const text = error.details || error.message
  const match = text.match(/policy\s+"([^"]+)"/)
  return match?.[1]
}

/**
 * Check if error is an RLS recursion error
 */
export function isRlsRecursionError(error: SupabaseError): boolean {
  return error.code === '42P17' || error.message?.includes('infinite recursion')
}

/**
 * Check if error is an RLS access denied error
 */
export function isRlsAccessDenied(error: SupabaseError): boolean {
  return error.code === '42501' || error.message?.includes('permission denied')
}

/**
 * Check if error is a "no rows" error (common with .single())
 */
export function isNoRowsError(error: SupabaseError): boolean {
  return error.code === 'PGRST116' || error.message?.includes('no rows')
}

/**
 * Create a helper object for common Supabase error scenarios
 */
export const traced = {
  /**
   * Parse any Supabase error
   */
  fromSupabase: (error: SupabaseError, context?: Partial<ErrorContext>) =>
    parseSupabaseError(error, context),

  /**
   * Create auth error
   */
  auth: (code: string, message: string, context?: Partial<ErrorContext>) =>
    new TracedError(code, message, context),

  /**
   * Create RLS error with table context
   */
  rls: (table: string, operation: string, context?: Partial<ErrorContext>) =>
    new TracedError('ERR_RLS_002', `Access denied to ${table}`, {
      ...context,
      table,
      operation: operation as ErrorContext['operation'],
    }),

  /**
   * Create not found error
   * Usage: traced.notFound('ERR_NOT_FOUND', 'Resource not found')
   */
  notFound: (code: string, message: string, context?: Partial<ErrorContext>) =>
    new TracedError(code, message, context),

  /**
   * Create validation error
   * Usage: traced.validation('ERR_VALIDATION_001', 'Field is required')
   */
  validation: (code: string, message: string, context?: Partial<ErrorContext>) =>
    new TracedError(code, message, context),

  /**
   * Create generic error with code
   * Usage: traced.error('ERR_CUSTOM_001', 'Something went wrong')
   */
  error: (code: string, message: string, context?: Partial<ErrorContext>) =>
    new TracedError(code, message, context),
}
