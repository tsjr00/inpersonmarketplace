/**
 * REFUSAL RECORDER
 *
 * Writes one row to `rule_refusals` each time the app tells a user "no", keyed
 * by a rule declared in refusal-registry.ts. See that file for why.
 *
 * THREE THINGS THIS MUST NEVER DO
 *
 *   1. Throw. It sits on user-facing paths including checkout. Telemetry that
 *      can break a purchase is worse than no telemetry. Everything is inside a
 *      try/catch that swallows.
 *   2. Be fired and forgotten. Vercel freezes the function once the response is
 *      returned, so an un-awaited insert is silently dropped — the same trap
 *      documented for sendNotification. Callers MUST await this.
 *   3. Be slow on the common path. Unregistered keys and disabled environments
 *      return before any client is constructed.
 */

import { createClient } from '@supabase/supabase-js'
import { REFUSAL_KEYS } from './refusal-registry'

export interface RefusalContext {
  vertical?: string | null
  route?: string | null
  method?: string | null
  userId?: string | null
  /** Small, bounded detail to tell firings apart. Never a request payload. */
  detail?: Record<string, unknown>
}

/** Mirrors lib/errors/logger.ts — same posture, same failure mode. */
function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function isRefusalTrackingEnabled(): boolean {
  // Never write rows from the test suite — it would make "has this rule ever
  // fired?" answer yes for rules that only ever fired in CI.
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return false
  return process.env.TRACK_REFUSALS !== 'false'
}

/**
 * Record that `ruleKey` refused a user. Safe to call anywhere; must be awaited.
 *
 * An unregistered key is dropped rather than written: a typo'd key would create
 * a phantom rule with no description and no owner, and worse, would leave the
 * real rule reading "never fired".
 */
export async function recordRefusal(ruleKey: string, context: RefusalContext = {}): Promise<void> {
  try {
    if (!isRefusalTrackingEnabled()) return

    if (!REFUSAL_KEYS.has(ruleKey)) {
      console.warn(
        `[refusals] "${ruleKey}" is not in REFUSAL_RULES — not recorded. ` +
          `Declare it in src/lib/telemetry/refusal-registry.ts.`
      )
      return
    }

    const supabase = createServiceClient()
    if (!supabase) return

    const { error } = await supabase.from('rule_refusals').insert({
      rule_key: ruleKey,
      vertical_id: context.vertical ?? null,
      route: context.route ?? null,
      method: context.method ?? null,
      user_id: context.userId ?? null,
      context: context.detail ?? {},
    })

    if (error) {
      // Console only. A telemetry write failing must never surface to a buyer.
      console.error(`[refusals] failed to record "${ruleKey}":`, error.message)
    }
  } catch (err) {
    console.error('[refusals] exception while recording:', err)
  }
}
