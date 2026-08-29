/**
 * observed() — make a dropped Supabase error visible without changing behavior.
 *
 * WHY (2026-08-25 → 2026-08-29): six defects sat in production for months —
 * the vendors page's dead market filter, a surveys cron that never surveyed
 * anyone, event settlement counting $0, a top-products 500, a daily scan that
 * rolled back every night — and NOT ONE reached error_logs, because the
 * callers wrote `const { data } = await …` and threw the error away. They
 * only surfaced because the owner read the raw Supabase API log. There are
 * ~830 such call sites (2026-08-29 count).
 *
 * The safe transformation is to keep the caller's shape and behavior exactly
 * — `data` is null on failure, as before — and ADD the log:
 *
 *   const { data } = await observed(supabase.from('x').select('…'), { table: 'x' })
 *
 * Rules:
 *   · never throws — the caller decides what null data means, as it always did
 *   · logs through logError() → console + error_logs (+ admin email for high)
 *   · route/method come from the breadcrumb trail when the call runs inside
 *     withErrorTracing (every API route); pass `route` for lib code that does not
 *   · PGRST116 ("no rows" from .single()) is NOT logged by default — it is the
 *     normal outcome of a lookup that finds nothing, not a failure
 *   · schema-class failures (unknown column / enum value / table / function)
 *     are the exact class that hid for months → forced to 'high' so the admin
 *     alert fires (throttled per code+route in logger.ts)
 */

import type { ErrorContext, SupabaseError } from './types'
import { parseSupabaseError } from './supabase-errors'
import { getBreadcrumbs } from './breadcrumbs'
import { logError } from './logger'

export interface ObserveContext {
  /** Table (or `rpc:<fn>`) the query targets — required so the log is actionable. */
  table: string
  operation?: ErrorContext['operation'] | 'upsert'
  /** Override when not running inside withErrorTracing (crons in lib/, webhooks). */
  route?: string
  /** Log PGRST116 ("no rows") too. Default false. */
  logNoRows?: boolean
  /** Extra business context (orderId, marketId, vendorId …). */
  extra?: Partial<ErrorContext>
}

/** PostgreSQL / PostgREST codes that mean "the code and the schema disagree". */
const SCHEMA_CLASS = new Set(['42703', '42P01', '42883', '22P02', 'PGRST200', 'PGRST204'])

/**
 * Typed from the query's own response so `data` keeps exactly the type the
 * caller had before (`T | null` for lists, singles and maybeSingles alike).
 */
export async function observed<R extends { data: unknown; error: SupabaseError | null }>(
  query: PromiseLike<R>,
  ctx: ObserveContext
): Promise<{ data: R['data'] | null; error: SupabaseError | null }> {
  const res = await query
  const error = res.error ?? null
  if (!error) return { data: res.data, error: null }

  const isNoRows = error.code === 'PGRST116'
  if (isNoRows && !ctx.logNoRows) return { data: null, error }

  try {
    const trail = getBreadcrumbs()
    const api = trail.find(b => b.category === 'api')
    const apiData = (api?.data ?? {}) as { route?: string; method?: string }
    const context: Partial<ErrorContext> = {
      ...(ctx.extra ?? {}),
      table: ctx.table,
      ...(ctx.operation ? { operation: ctx.operation === 'upsert' ? 'insert' : ctx.operation, verb: ctx.operation } : {}),
      route: ctx.route ?? apiData.route ?? 'unknown',
      ...(apiData.method ? { method: apiData.method } : {}),
      observed: true,
    }
    const traced = parseSupabaseError(error, context)
    if (error.code && SCHEMA_CLASS.has(error.code)) {
      // readonly by declaration; the class assigns from the catalog. Schema
      // drift must page someone — it is silent by construction otherwise.
      ;(traced as { severity: string }).severity = 'high'
    }
    await logError(traced)
  } catch {
    // Logging must never become the failure.
  }
  return { data: null, error }
}
