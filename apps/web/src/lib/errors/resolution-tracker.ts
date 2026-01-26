/**
 * Error Resolution Tracker
 *
 * Tracks fix attempts for errors and verifies whether they actually worked.
 * This prevents re-trying failed approaches and builds a knowledge base of
 * verified solutions.
 *
 * Usage:
 * ```typescript
 * // Before attempting a fix, check what's been tried
 * const failed = await getFailedApproaches('ERR_RLS_001')
 * const verified = await getVerifiedSolutions('ERR_RLS_001')
 *
 * // Record a new fix attempt
 * const resolutionId = await recordFixAttempt({
 *   errorCode: 'ERR_RLS_001',
 *   attemptedFix: 'Remove order_items reference from orders_select policy',
 *   migrationFile: '20260126_011_fix_rls_recursion.sql',
 *   verificationQuery: 'SELECT * FROM orders WHERE buyer_user_id = $1 LIMIT 1'
 * })
 *
 * // After testing, record the outcome
 * await verifyResolution(resolutionId, {
 *   worked: true,
 *   method: 'manual',
 *   verifiedBy: 'developer'
 * })
 *
 * // Or if it failed
 * await verifyResolution(resolutionId, {
 *   worked: false,
 *   reason: 'Still getting 42P17 - another circular reference exists'
 * })
 * ```
 */

import { createClient } from '@supabase/supabase-js'
import {
  ErrorResolution,
  ResolutionStatus,
  VerifiedSolution,
  FailedApproach,
} from './types'

/**
 * Create a service role client for resolution tracking
 */
function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[ResolutionTracker] Missing Supabase service role credentials')
    return null
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// ============================================================================
// Query Functions - Get existing resolutions
// ============================================================================

/**
 * Get all failed approaches for an error code
 * Use this BEFORE attempting a fix to avoid re-trying what didn't work
 */
export async function getFailedApproaches(
  errorCode: string
): Promise<FailedApproach[]> {
  const supabase = createServiceClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('error_resolutions')
    .select('attempted_fix, migration_file, failure_reason, created_at')
    .eq('error_code', errorCode)
    .eq('status', 'failed')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[ResolutionTracker] Failed to get failed approaches:', error)
    return []
  }

  return (data || []).map((row) => ({
    description: row.attempted_fix,
    migrationFile: row.migration_file,
    reason: row.failure_reason || 'Unknown reason',
    attemptedAt: row.created_at,
  }))
}

/**
 * Get all verified solutions for an error code
 * Use this to find what actually works
 */
export async function getVerifiedSolutions(
  errorCode: string
): Promise<VerifiedSolution[]> {
  const supabase = createServiceClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('error_resolutions')
    .select('attempted_fix, migration_file, verified_at, verified_by')
    .eq('error_code', errorCode)
    .eq('status', 'verified')
    .order('verified_at', { ascending: false })

  if (error) {
    console.error('[ResolutionTracker] Failed to get verified solutions:', error)
    return []
  }

  return (data || []).map((row) => ({
    description: row.attempted_fix,
    migrationFile: row.migration_file,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by || 'unknown',
  }))
}

/**
 * Get pending resolutions that need verification
 */
export async function getPendingResolutions(
  errorCode?: string
): Promise<ErrorResolution[]> {
  const supabase = createServiceClient()
  if (!supabase) return []

  let query = supabase
    .from('error_resolutions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (errorCode) {
    query = query.eq('error_code', errorCode)
  }

  const { data, error } = await query

  if (error) {
    console.error('[ResolutionTracker] Failed to get pending resolutions:', error)
    return []
  }

  return (data || []).map(mapRowToResolution)
}

/**
 * Get the full resolution history for an error code
 */
export async function getResolutionHistory(
  errorCode: string
): Promise<ErrorResolution[]> {
  const supabase = createServiceClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('error_resolutions')
    .select('*')
    .eq('error_code', errorCode)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[ResolutionTracker] Failed to get resolution history:', error)
    return []
  }

  return (data || []).map(mapRowToResolution)
}

// ============================================================================
// Mutation Functions - Record and verify resolutions
// ============================================================================

export interface RecordFixAttemptParams {
  errorCode: string
  attemptedFix: string
  migrationFile?: string
  codeChanges?: string
  traceId?: string
  verificationQuery?: string
  createdBy?: string
}

/**
 * Record a new fix attempt
 * Call this BEFORE applying a fix, then call verifyResolution after testing
 */
export async function recordFixAttempt(
  params: RecordFixAttemptParams
): Promise<string | null> {
  const supabase = createServiceClient()
  if (!supabase) {
    console.error('[ResolutionTracker] Cannot record fix - no service client')
    return null
  }

  const { data, error } = await supabase
    .from('error_resolutions')
    .insert({
      error_code: params.errorCode,
      attempted_fix: params.attemptedFix,
      migration_file: params.migrationFile,
      code_changes: params.codeChanges,
      trace_id: params.traceId,
      verification_query: params.verificationQuery,
      status: 'pending',
      created_by: params.createdBy || 'claude-code',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[ResolutionTracker] Failed to record fix attempt:', error)
    return null
  }

  console.log(
    `[ResolutionTracker] Recorded fix attempt for ${params.errorCode}: ${data.id}`
  )
  return data.id
}

export interface VerifyResolutionParams {
  worked: boolean
  method?: 'manual' | 'query' | 'api_test' | 'automated'
  reason?: string // Required if worked === false
  partialNotes?: string // If status should be 'partial'
  verificationResult?: string
  verifiedBy?: string
}

/**
 * Verify whether a fix attempt worked
 * Call this AFTER applying and testing a fix
 */
export async function verifyResolution(
  resolutionId: string,
  params: VerifyResolutionParams
): Promise<boolean> {
  const supabase = createServiceClient()
  if (!supabase) {
    console.error('[ResolutionTracker] Cannot verify - no service client')
    return false
  }

  let status: ResolutionStatus = params.worked ? 'verified' : 'failed'
  if (params.partialNotes) {
    status = 'partial'
  }

  const updateData: Record<string, unknown> = {
    status,
    verification_method: params.method || 'manual',
    verification_result: params.verificationResult,
    verified_by: params.verifiedBy || 'developer',
    verified_at: new Date().toISOString(),
  }

  if (!params.worked) {
    updateData.failure_reason = params.reason || 'Fix did not resolve the error'
  }

  if (params.partialNotes) {
    updateData.partial_notes = params.partialNotes
  }

  const { error } = await supabase
    .from('error_resolutions')
    .update(updateData)
    .eq('id', resolutionId)

  if (error) {
    console.error('[ResolutionTracker] Failed to verify resolution:', error)
    return false
  }

  const statusEmoji = status === 'verified' ? '✓' : status === 'failed' ? '✗' : '~'
  console.log(`[ResolutionTracker] Resolution ${resolutionId} marked as ${status} ${statusEmoji}`)

  return true
}

/**
 * Quick helper to mark a resolution as verified
 */
export async function markResolutionVerified(
  resolutionId: string,
  verifiedBy?: string
): Promise<boolean> {
  return verifyResolution(resolutionId, {
    worked: true,
    method: 'manual',
    verifiedBy,
  })
}

/**
 * Quick helper to mark a resolution as failed
 */
export async function markResolutionFailed(
  resolutionId: string,
  reason: string
): Promise<boolean> {
  return verifyResolution(resolutionId, {
    worked: false,
    reason,
  })
}

// ============================================================================
// Summary Functions - For developer context
// ============================================================================

export interface ResolutionSummary {
  errorCode: string
  totalAttempts: number
  verifiedCount: number
  failedCount: number
  pendingCount: number
  latestVerified?: VerifiedSolution
  failedApproaches: string[]
}

/**
 * Get a summary of resolution attempts for an error code
 * Useful for understanding the history before attempting a new fix
 */
export async function getResolutionSummary(
  errorCode: string
): Promise<ResolutionSummary | null> {
  const supabase = createServiceClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('error_resolutions')
    .select('status, attempted_fix, migration_file, failure_reason, verified_at, verified_by')
    .eq('error_code', errorCode)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[ResolutionTracker] Failed to get summary:', error)
    return null
  }

  const rows = data || []

  const verified = rows.filter((r) => r.status === 'verified')
  const failed = rows.filter((r) => r.status === 'failed')
  const pending = rows.filter((r) => r.status === 'pending')

  const latestVerified = verified[0]
    ? {
        description: verified[0].attempted_fix,
        migrationFile: verified[0].migration_file,
        verifiedAt: verified[0].verified_at,
        verifiedBy: verified[0].verified_by || 'unknown',
      }
    : undefined

  return {
    errorCode,
    totalAttempts: rows.length,
    verifiedCount: verified.length,
    failedCount: failed.length,
    pendingCount: pending.length,
    latestVerified,
    failedApproaches: failed.map((f) => f.attempted_fix),
  }
}

/**
 * Format a resolution summary for console output
 */
export function formatResolutionSummary(summary: ResolutionSummary): string {
  const lines = [
    `\n╔══════════════════════════════════════════════════════════════════════╗`,
    `║ Resolution History for ${summary.errorCode}`,
    `╠══════════════════════════════════════════════════════════════════════╣`,
    `║ Total Attempts: ${summary.totalAttempts}`,
    `║ Verified: ${summary.verifiedCount} | Failed: ${summary.failedCount} | Pending: ${summary.pendingCount}`,
  ]

  if (summary.latestVerified) {
    lines.push(`╠══════════════════════════════════════════════════════════════════════╣`)
    lines.push(`║ ✓ VERIFIED SOLUTION:`)
    lines.push(`║   ${summary.latestVerified.description}`)
    if (summary.latestVerified.migrationFile) {
      lines.push(`║   Migration: ${summary.latestVerified.migrationFile}`)
    }
  }

  if (summary.failedApproaches.length > 0) {
    lines.push(`╠══════════════════════════════════════════════════════════════════════╣`)
    lines.push(`║ ✗ FAILED APPROACHES (do not retry):`)
    summary.failedApproaches.forEach((approach) => {
      lines.push(`║   • ${approach}`)
    })
  }

  lines.push(`╚══════════════════════════════════════════════════════════════════════╝\n`)

  return lines.join('\n')
}

/**
 * Print resolution summary to console
 */
export async function printResolutionSummary(errorCode: string): Promise<void> {
  const summary = await getResolutionSummary(errorCode)
  if (summary) {
    console.log(formatResolutionSummary(summary))
  } else {
    console.log(`No resolution history found for ${errorCode}`)
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function mapRowToResolution(row: Record<string, unknown>): ErrorResolution {
  return {
    id: row.id as string,
    errorCode: row.error_code as string,
    traceId: row.trace_id as string | undefined,
    attemptedFix: row.attempted_fix as string,
    migrationFile: row.migration_file as string | undefined,
    codeChanges: row.code_changes as string | undefined,
    status: row.status as ResolutionStatus,
    failureReason: row.failure_reason as string | undefined,
    partialNotes: row.partial_notes as string | undefined,
    verificationMethod: row.verification_method as
      | 'manual'
      | 'query'
      | 'api_test'
      | 'automated'
      | undefined,
    verificationQuery: row.verification_query as string | undefined,
    verificationResult: row.verification_result as string | undefined,
    verifiedAt: row.verified_at as string | undefined,
    verifiedBy: row.verified_by as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    createdBy: row.created_by as string | undefined,
  }
}
