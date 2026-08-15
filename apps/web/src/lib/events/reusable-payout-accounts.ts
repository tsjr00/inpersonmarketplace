import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Reusable Stripe payout accounts for an event organizer (owner decision
 * 2026-08-15): an organizer who already has a working Connect account — as a
 * VENDOR (vendor_profiles.stripe_*) or from a PRIOR EVENT they organized
 * (markets.stripe_* on that event's market) — may point this event's market at
 * it instead of onboarding again. Offered, never automatic: the same person is
 * not always the same business, so the organizer explicitly picks.
 *
 * Mig 141's "one account per market" COMMENT documents the default; this
 * feature is the sanctioned exception. Safe because the only lookups BY
 * account id are the account.updated webhook's bulk status syncs
 * (lib/stripe/webhooks.ts), which update every row carrying the id — a shared
 * account keeps all its rows in sync.
 *
 * SECURITY: this derivation runs server-side in both the route that LISTS
 * options and the route that APPLIES one. The client only ever sends a
 * `source` keyword — never an account id — so an organizer cannot point their
 * event at an account this function didn't derive as theirs.
 */
export interface ReusablePayoutAccount {
  source: 'vendor' | 'prior_event'
  stripeAccountId: string
  /** Business or event name shown on the choice button. */
  label: string
}

export async function getReusablePayoutAccounts(
  serviceClient: SupabaseClient,
  userId: string,
  opts: { excludeMarketId: string; verticalId: string }
): Promise<ReusablePayoutAccount[]> {
  const options: ReusablePayoutAccount[] = []

  // Their vendor payout account, if onboarding finished. Same-vertical profile
  // preferred when they vend in both.
  const { data: vendorProfiles } = await serviceClient
    .from('vendor_profiles')
    .select('vertical_id, profile_data, stripe_account_id, stripe_onboarding_complete')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .not('stripe_account_id', 'is', null)
    .eq('stripe_onboarding_complete', true)

  const vendorProfile = (vendorProfiles || []).sort((a, b) =>
    (b.vertical_id === opts.verticalId ? 1 : 0) - (a.vertical_id === opts.verticalId ? 1 : 0)
  )[0]
  if (vendorProfile) {
    const pd = vendorProfile.profile_data as Record<string, unknown> | null
    options.push({
      source: 'vendor',
      stripeAccountId: vendorProfile.stripe_account_id as string,
      label:
        (pd?.business_name as string) || (pd?.farm_name as string) || 'your vendor account',
    })
  }

  // The account from the most recent PRIOR event they organized whose
  // onboarding finished.
  const { data: priorEvents } = await serviceClient
    .from('catering_requests')
    .select('market_id, event_date, company_name')
    .eq('organizer_user_id', userId)
    .not('market_id', 'is', null)
    .neq('market_id', opts.excludeMarketId)
    .order('event_date', { ascending: false })
    .limit(20)

  const priorMarketIds = (priorEvents || []).map(e => e.market_id as string)
  if (priorMarketIds.length > 0) {
    const { data: priorMarkets } = await serviceClient
      .from('markets')
      .select('id, stripe_account_id')
      .in('id', priorMarketIds)
      .not('stripe_account_id', 'is', null)
      .eq('stripe_onboarding_complete', true)

    const byMarketId = new Map((priorMarkets || []).map(m => [m.id as string, m.stripe_account_id as string]))
    // priorEvents is already newest-first; take the first with a usable account.
    const recent = (priorEvents || []).find(e => byMarketId.has(e.market_id as string))
    if (recent) {
      const accountId = byMarketId.get(recent.market_id as string) as string
      // Same account on both (they reused before): one button is enough.
      if (!options.some(o => o.stripeAccountId === accountId)) {
        options.push({
          source: 'prior_event',
          stripeAccountId: accountId,
          label: `${(recent.company_name as string) || 'your previous event'} (${recent.event_date})`,
        })
      }
    }
  }

  return options
}
