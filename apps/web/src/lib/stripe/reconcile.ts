/**
 * Stripe reconciliation library
 *
 * Maps Stripe objects (PaymentIntent / Charge / Transfer / Payout) back to
 * the platform's local records (orders / market_box_subscriptions /
 * event_company_payments / vendor_payouts). Used by the admin reconcile page
 * (`/[vertical]/admin/stripe-reconcile`) for tracing money flow without
 * paging through the Stripe dashboard separately.
 *
 * **A-readiness:** when the metadata-enrichment work (backlog: "Pass platform
 * order number/ID to Stripe metadata") ships, the matching pipeline below
 * gains `metadata.order_number` and `metadata.order_id` on objects that don't
 * carry them today (market box charges, all transfers). The pipeline order
 * already prefers metadata fast-paths; the inferential fallbacks remain as
 * belt-and-suspenders for legacy data. No rewrite of this file required.
 *
 * The matching pipeline runs in this order per Stripe object:
 *   1. metadata.order_number → DB lookup by orders.order_number
 *   2. metadata.order_id → DB lookup by orders.id
 *   3. client_reference_id parse (UUID or `market_box_{offeringId}_{userId}`)
 *   4. Inferential: market_box_subscriptions.stripe_payment_intent_id match
 *   5. Inferential: event_company_payments.stripe_payment_intent_id match
 *   6. Inferential: vendor_payouts.stripe_transfer_id match (transfers only)
 *
 * The `metadataCompleteness` field flags which of the fast-path metadata
 * fields are present on the Stripe object — used by the reconcile UI to
 * surface the gap that A will close.
 */

import { stripe } from './config'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ────────────────────────────────────────────────────────────

export type StripeObjectType = 'payment_intent' | 'charge' | 'transfer' | 'payout'

export interface ReconcileStripeObject {
  type: StripeObjectType
  id: string
  amountCents: number | null
  createdAt: string | null
  status: string | null
  metadata: Record<string, string>
  /** Raw Stripe object (subset of fields most useful in the UI) */
  raw: Record<string, unknown>
}

export interface MatchedOrder {
  orderType: 'order' | 'market_box_subscription' | 'event_company_payment'
  orderNumber: string | null
  orderId: string | null
  buyerName: string | null
  buyerEmail: string | null
  vendorName: string | null
  amountCents: number | null
  /** Platform-retained fee for this order (Stripe-side). Null for non-order
   *  matches (market_box / event_company_payment) — those track revenue
   *  differently. */
  platformFeeCents: number | null
  vertical: string | null
  status: string | null
  /** How the match was made — one of the pipeline step labels */
  matchedVia:
    | 'metadata_order_number'
    | 'metadata_order_id'
    | 'client_reference_id_uuid'
    | 'client_reference_id_market_box'
    | 'payments_payment_intent'
    | 'market_box_subscription_payment_intent'
    | 'event_company_payment_intent'
    | 'vendor_payouts_transfer'
    | 'reverse_lookup_order_number'
    | 'reverse_lookup_email'
  /** Stripe IDs already known for this match (from DB).
   *  charge_id is intentionally absent — payments table only stores
   *  stripe_payment_intent_id; charge IDs come from Stripe API at runtime. */
  stripeIds: {
    payment_intent_id?: string | null
    transfer_ids?: string[]
  }
}

/**
 * Internal lookup outcome — distinguishes the three reasons a DB lookup
 * may not return a match. The reconcile orchestrator uses this to produce
 * accurate per-line diagnostics in the audit UI.
 */
type LookupOutcome =
  | { kind: 'matched'; order: MatchedOrder }
  | { kind: 'not_found' }
  | { kind: 'cross_vertical' }
  | { kind: 'query_error'; message: string }

export interface MetadataCompleteness {
  has_order_number: boolean
  has_order_id: boolean
  /** Fields the A-pass should add but haven't yet */
  missingFields: string[]
}

export interface MatchResult {
  stripeObject: ReconcileStripeObject | null
  matchedOrders: MatchedOrder[]
  metadataCompleteness: MetadataCompleteness
  /** Non-fatal info messages — orphans, vertical denials, etc. */
  warnings: string[]
}

export interface PayoutAuditResult {
  payout: ReconcileStripeObject
  /** Each balance transaction with its source-object reconciliation */
  lines: Array<{
    balanceTransactionId: string
    type: string
    amountCents: number
    netCents: number
    feeCents: number
    sourceId: string | null
    /** Match for the source object — null for fee/payout/adjustment lines that
     *  aren't tied to a charge/transfer/refund */
    match: MatchResult | null
    /** When match is null, a short reason string for surface in the UI.
     *  Lets the user see WHY a row didn't match instead of guessing. */
    diagnostic?: string
  }>
  totals: {
    grossCents: number
    feeCents: number
    netCents: number
  }
}

// ── Stripe ID detection ──────────────────────────────────────────────

export type DetectedQueryType =
  | { kind: 'stripe_payment_intent'; id: string }
  | { kind: 'stripe_charge'; id: string }
  | { kind: 'stripe_transfer'; id: string }
  | { kind: 'stripe_payout'; id: string }
  | { kind: 'stripe_refund'; id: string }
  | { kind: 'order_number'; value: string }
  | { kind: 'email'; value: string }
  | { kind: 'unknown'; value: string }

export function detectQueryType(raw: string): DetectedQueryType {
  const s = raw.trim()
  if (!s) return { kind: 'unknown', value: '' }

  // Stripe ID prefixes
  if (/^pi_/.test(s)) return { kind: 'stripe_payment_intent', id: s }
  if (/^ch_/.test(s)) return { kind: 'stripe_charge', id: s }
  if (/^tr_/.test(s)) return { kind: 'stripe_transfer', id: s }
  if (/^po_/.test(s)) return { kind: 'stripe_payout', id: s }
  if (/^re_/.test(s)) return { kind: 'stripe_refund', id: s }

  // Email
  if (/@/.test(s)) return { kind: 'email', value: s.toLowerCase() }

  // Order number — letters + dashes + digits, not too short
  if (/^[A-Z]{2,4}-\d{4}-[A-Z0-9]{6,10}$/i.test(s)) {
    return { kind: 'order_number', value: s.toUpperCase() }
  }

  return { kind: 'unknown', value: s }
}

// ── Metadata completeness check ──────────────────────────────────────

function evaluateMetadata(metadata: Record<string, string>): MetadataCompleteness {
  const has_order_number = typeof metadata.order_number === 'string' && metadata.order_number.length > 0
  const has_order_id = typeof metadata.order_id === 'string' && metadata.order_id.length > 0
  const missingFields: string[] = []
  if (!has_order_number) missingFields.push('order_number')
  if (!has_order_id) missingFields.push('order_id')
  return { has_order_number, has_order_id, missingFields }
}

// ── DB lookup helpers ────────────────────────────────────────────────

interface ScopeFilter {
  isPlatformAdmin: boolean
  effectiveVerticalId: string | null
}

/** Apply vertical scoping: returns true if the row is visible to this admin. */
function visibleToScope(rowVertical: string | null | undefined, scope: ScopeFilter): boolean {
  if (scope.isPlatformAdmin) return true
  if (!scope.effectiveVerticalId) return false
  return rowVertical === scope.effectiveVerticalId
}

async function lookupOrderById(
  serviceClient: SupabaseClient,
  orderId: string,
  scope: ScopeFilter,
  matchedVia: MatchedOrder['matchedVia'],
): Promise<LookupOutcome> {
  // Note: payments.stripe_charge_id does NOT exist (only stripe_payment_intent_id).
  // Verified against schema. Selecting it would silently fail the entire query.
  const { data: order, error } = await serviceClient
    .from('orders')
    .select(`
      id, order_number, status, total_cents, platform_fee_cents, vertical_id, buyer_user_id,
      payments:payments(stripe_payment_intent_id, platform_fee_cents),
      order_items:order_items(vendor_payouts:vendor_payouts(stripe_transfer_id))
    `)
    .eq('id', orderId)
    .maybeSingle()

  if (error) return { kind: 'query_error', message: `orders lookup: ${error.message}` }
  if (!order) return { kind: 'not_found' }
  if (!visibleToScope(order.vertical_id as string | null, scope)) {
    return { kind: 'cross_vertical' }
  }

  let buyerEmail: string | null = null
  let buyerName: string | null = null
  if (order.buyer_user_id) {
    const { data: buyer } = await serviceClient
      .from('user_profiles')
      .select('email, display_name')
      .eq('user_id', order.buyer_user_id)
      .maybeSingle()
    buyerEmail = (buyer?.email as string) || null
    buyerName = (buyer?.display_name as string) || null
  }

  const payments = (order.payments as unknown as Array<{ stripe_payment_intent_id: string | null; platform_fee_cents: number | null }>) || []
  const orderItems = (order.order_items as unknown as Array<{ vendor_payouts: Array<{ stripe_transfer_id: string | null }> }>) || []
  const transferIds = orderItems
    .flatMap(oi => (oi.vendor_payouts || []).map(vp => vp.stripe_transfer_id))
    .filter((x): x is string => !!x)

  // Prefer the per-order platform fee from `orders` (computed at order creation).
  // Fall back to the payments row if for some reason the orders column is null.
  // NOTE: this is the vendor-side platform fee only. Settlement page computes
  // total platform revenue as buyer_fee + buyer_flat_fee + platform_fee_cents
  // + vendor_flat_fee. Reconcile-tool number may understate by ~$0.30/order
  // until aligned with settlement math (separate refinement).
  const platformFeeCents = (order.platform_fee_cents as number | null) ??
    (payments[0]?.platform_fee_cents ?? null)

  return {
    kind: 'matched',
    order: {
      orderType: 'order',
      orderNumber: order.order_number as string,
      orderId: order.id as string,
      buyerName,
      buyerEmail,
      vendorName: null, // multi-vendor possible — populated only on request
      amountCents: order.total_cents as number,
      platformFeeCents,
      vertical: order.vertical_id as string | null,
      status: order.status as string,
      matchedVia,
      stripeIds: {
        payment_intent_id: payments[0]?.stripe_payment_intent_id || null,
        transfer_ids: transferIds,
      },
    },
  }
}

async function lookupOrderByNumber(
  serviceClient: SupabaseClient,
  orderNumber: string,
  scope: ScopeFilter,
  matchedVia: MatchedOrder['matchedVia'],
): Promise<LookupOutcome> {
  const { data: order, error } = await serviceClient
    .from('orders')
    .select('id')
    .eq('order_number', orderNumber)
    .maybeSingle()

  if (error) return { kind: 'query_error', message: `orders lookup: ${error.message}` }
  if (!order) return { kind: 'not_found' }
  return lookupOrderById(serviceClient, order.id as string, scope, matchedVia)
}

async function lookupMarketBoxSubByPI(
  serviceClient: SupabaseClient,
  paymentIntentId: string,
  scope: ScopeFilter,
): Promise<LookupOutcome> {
  // Note: market_box_subscriptions does NOT have a vertical_id column —
  // vertical comes from the joined offering. Verified against schema.
  const { data: sub, error } = await serviceClient
    .from('market_box_subscriptions')
    .select(`
      id, status, term_weeks, buyer_user_id, offering_id, order_id,
      offerings:market_box_offerings!offering_id(name, vertical_id, vendor_profile_id, vendor_profiles:vendor_profiles!vendor_profile_id(profile_data))
    `)
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()

  if (error) return { kind: 'query_error', message: `market_box_subscriptions lookup: ${error.message}` }
  if (!sub) return { kind: 'not_found' }
  const offering = sub.offerings as unknown as { name: string; vertical_id: string; vendor_profiles: { profile_data: Record<string, unknown> } } | null
  const vertical = offering?.vertical_id || null
  if (!visibleToScope(vertical, scope)) return { kind: 'cross_vertical' }

  let buyerEmail: string | null = null
  let buyerName: string | null = null
  if (sub.buyer_user_id) {
    const { data: buyer } = await serviceClient
      .from('user_profiles')
      .select('email, display_name')
      .eq('user_id', sub.buyer_user_id)
      .maybeSingle()
    buyerEmail = (buyer?.email as string) || null
    buyerName = (buyer?.display_name as string) || null
  }

  const vendorName = (offering?.vendor_profiles?.profile_data as { business_name?: string })?.business_name || null

  // Also pull related order if the subscription has spawned one
  let orderNumber: string | null = null
  if (sub.order_id) {
    const { data: ord } = await serviceClient
      .from('orders')
      .select('order_number')
      .eq('id', sub.order_id)
      .maybeSingle()
    orderNumber = (ord?.order_number as string) || null
  }

  // vendor_payouts for market box
  const { data: payouts } = await serviceClient
    .from('vendor_payouts')
    .select('stripe_transfer_id')
    .eq('market_box_subscription_id', sub.id)

  return {
    kind: 'matched',
    order: {
      orderType: 'market_box_subscription',
      orderNumber,
      orderId: sub.order_id as string | null,
      buyerName,
      buyerEmail,
      vendorName,
      amountCents: null, // MB amount tracking is on the order
      platformFeeCents: null, // see MatchedOrder.platformFeeCents — null for non-order types
      vertical,
      status: sub.status as string,
      matchedVia: 'market_box_subscription_payment_intent',
      stripeIds: {
        payment_intent_id: paymentIntentId,
        transfer_ids: (payouts || []).map(p => p.stripe_transfer_id as string).filter(Boolean),
      },
    },
  }
}

async function lookupEventCompanyPaymentByPI(
  serviceClient: SupabaseClient,
  paymentIntentId: string,
  scope: ScopeFilter,
): Promise<LookupOutcome> {
  const { data: ecp, error } = await serviceClient
    .from('event_company_payments')
    .select(`
      id, status, amount_cents, payment_type,
      catering:catering_requests!catering_request_id(id, company_name, contact_email, vertical_id, status)
    `)
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()

  if (error) return { kind: 'query_error', message: `event_company_payments lookup: ${error.message}` }
  if (!ecp) return { kind: 'not_found' }
  const catering = ecp.catering as unknown as { id: string; company_name: string; contact_email: string; vertical_id: string; status: string } | null
  if (!visibleToScope(catering?.vertical_id ?? null, scope)) return { kind: 'cross_vertical' }

  return {
    kind: 'matched',
    order: {
      orderType: 'event_company_payment',
      orderNumber: null,
      orderId: catering?.id || null,
      buyerName: catering?.company_name || null,
      buyerEmail: catering?.contact_email || null,
      vendorName: null,
      amountCents: ecp.amount_cents as number,
      platformFeeCents: null, // see MatchedOrder.platformFeeCents — null for non-order types
      vertical: catering?.vertical_id || null,
      status: ecp.status as string,
      matchedVia: 'event_company_payment_intent',
      stripeIds: { payment_intent_id: paymentIntentId },
    },
  }
}

async function lookupVendorPayoutByTransfer(
  serviceClient: SupabaseClient,
  transferId: string,
  scope: ScopeFilter,
): Promise<LookupOutcome> {
  const { data: payout, error } = await serviceClient
    .from('vendor_payouts')
    .select('id, order_item_id, market_box_subscription_id, amount_cents, vendor_profile_id')
    .eq('stripe_transfer_id', transferId)
    .maybeSingle()

  if (error) return { kind: 'query_error', message: `vendor_payouts lookup: ${error.message}` }
  if (!payout) return { kind: 'not_found' }

  // Resolve to either an order or a market box subscription
  if (payout.order_item_id) {
    const { data: oi, error: oiErr } = await serviceClient
      .from('order_items')
      .select('order_id')
      .eq('id', payout.order_item_id)
      .maybeSingle()
    if (oiErr) return { kind: 'query_error', message: `order_items lookup: ${oiErr.message}` }
    if (oi?.order_id) {
      return lookupOrderById(serviceClient, oi.order_id as string, scope, 'vendor_payouts_transfer')
    }
  }

  if (payout.market_box_subscription_id) {
    const { data: sub, error: subErr } = await serviceClient
      .from('market_box_subscriptions')
      .select('stripe_payment_intent_id')
      .eq('id', payout.market_box_subscription_id)
      .maybeSingle()
    if (subErr) return { kind: 'query_error', message: `market_box_subscriptions lookup: ${subErr.message}` }
    if (sub?.stripe_payment_intent_id) {
      return lookupMarketBoxSubByPI(serviceClient, sub.stripe_payment_intent_id as string, scope)
    }
  }

  return { kind: 'not_found' }
}

// ── Orchestrator: reconcile a Stripe object ──────────────────────────

async function buildReconcileStripeObject(
  type: StripeObjectType,
  raw: Record<string, unknown>,
): Promise<ReconcileStripeObject> {
  const created = raw.created as number | undefined
  return {
    type,
    id: raw.id as string,
    amountCents: (raw.amount as number) ?? null,
    createdAt: created ? new Date(created * 1000).toISOString() : null,
    status: (raw.status as string) || null,
    metadata: (raw.metadata as Record<string, string>) || {},
    raw,
  }
}

/**
 * Reconcile a Stripe object by ID. Single Stripe API call (charge lookup may
 * need a second call to retrieve its parent PI).
 */
export async function reconcileStripeObject(
  serviceClient: SupabaseClient,
  stripeId: string,
  scope: ScopeFilter,
): Promise<MatchResult> {
  const detected = detectQueryType(stripeId)
  const warnings: string[] = []
  let stripeObject: ReconcileStripeObject | null = null

  // Resolve to a PaymentIntent or Transfer for matching purposes
  let paymentIntentId: string | null = null
  let transferId: string | null = null
  let metadata: Record<string, string> = {}
  let clientReferenceId: string | null = null

  try {
    if (detected.kind === 'stripe_payment_intent') {
      const pi = await stripe.paymentIntents.retrieve(detected.id)
      stripeObject = await buildReconcileStripeObject('payment_intent', pi as unknown as Record<string, unknown>)
      paymentIntentId = pi.id
      metadata = (pi.metadata as Record<string, string>) || {}
    } else if (detected.kind === 'stripe_charge') {
      const ch = await stripe.charges.retrieve(detected.id)
      stripeObject = await buildReconcileStripeObject('charge', ch as unknown as Record<string, unknown>)
      paymentIntentId = (ch.payment_intent as string) || null
      metadata = (ch.metadata as Record<string, string>) || {}
    } else if (detected.kind === 'stripe_transfer') {
      const tr = await stripe.transfers.retrieve(detected.id)
      stripeObject = await buildReconcileStripeObject('transfer', tr as unknown as Record<string, unknown>)
      transferId = tr.id
      metadata = (tr.metadata as Record<string, string>) || {}
    } else if (detected.kind === 'stripe_payout') {
      const po = await stripe.payouts.retrieve(detected.id)
      stripeObject = await buildReconcileStripeObject('payout', po as unknown as Record<string, unknown>)
      // Payouts don't reconcile to a single order — caller should use
      // reconcilePayout() for the per-line breakdown
      warnings.push('Payouts contain many transactions. Use the payout audit view to see line-by-line matches.')
      return {
        stripeObject,
        matchedOrders: [],
        metadataCompleteness: evaluateMetadata({}),
        warnings,
      }
    } else {
      return {
        stripeObject: null,
        matchedOrders: [],
        metadataCompleteness: evaluateMetadata({}),
        warnings: [`Unrecognized Stripe ID format: "${stripeId}". Expected pi_/ch_/tr_/po_ prefix.`],
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      stripeObject: null,
      matchedOrders: [],
      metadataCompleteness: evaluateMetadata({}),
      warnings: [`Stripe API error: ${msg}`],
    }
  }

  // Try to read client_reference_id if this was a checkout session (not
  // available on PI/charge directly, but we may have stored it elsewhere)
  // For now we only inspect metadata.
  clientReferenceId = (metadata.order_id as string) || null

  const completeness = evaluateMetadata(metadata)
  const matched: MatchedOrder[] = []
  // Track the most informative non-success outcome from the pipeline so we
  // can surface a useful warning if all pipeline steps fail.
  let lastReason: LookupOutcome | null = null

  // Helper: try a lookup; on success push it; on failure track the reason
  function processOutcome(outcome: LookupOutcome): boolean {
    if (outcome.kind === 'matched') {
      matched.push(outcome.order)
      return true
    }
    // query_error trumps cross_vertical trumps not_found in informativeness
    if (outcome.kind === 'query_error') {
      lastReason = outcome
    } else if (outcome.kind === 'cross_vertical' && lastReason?.kind !== 'query_error') {
      lastReason = outcome
    } else if (outcome.kind === 'not_found' && !lastReason) {
      lastReason = outcome
    }
    return false
  }

  // Pipeline step 1: metadata.order_number
  if (metadata.order_number) {
    processOutcome(await lookupOrderByNumber(serviceClient, metadata.order_number, scope, 'metadata_order_number'))
  }

  // Pipeline step 2: metadata.order_id
  if (matched.length === 0 && metadata.order_id) {
    processOutcome(await lookupOrderById(serviceClient, metadata.order_id, scope, 'metadata_order_id'))
  }

  // Pipeline step 3: client_reference_id (UUID parse)
  if (matched.length === 0 && clientReferenceId && /^[0-9a-f-]{36}$/i.test(clientReferenceId)) {
    processOutcome(await lookupOrderById(serviceClient, clientReferenceId, scope, 'client_reference_id_uuid'))
  }

  // Pipeline step 4: market_box_subscriptions.stripe_payment_intent_id
  if (matched.length === 0 && paymentIntentId) {
    processOutcome(await lookupMarketBoxSubByPI(serviceClient, paymentIntentId, scope))
  }

  // Pipeline step 5: payments.stripe_payment_intent_id (regular orders)
  if (matched.length === 0 && paymentIntentId) {
    const { data: pay, error: payErr } = await serviceClient
      .from('payments')
      .select('order_id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle()
    if (payErr) {
      lastReason = { kind: 'query_error', message: `payments lookup: ${payErr.message}` }
    } else if (pay?.order_id) {
      processOutcome(await lookupOrderById(serviceClient, pay.order_id as string, scope, 'payments_payment_intent'))
    }
  }

  // Pipeline step 6: event_company_payments
  if (matched.length === 0 && paymentIntentId) {
    processOutcome(await lookupEventCompanyPaymentByPI(serviceClient, paymentIntentId, scope))
  }

  // Pipeline step 7: vendor_payouts (transfers only)
  if (matched.length === 0 && transferId) {
    processOutcome(await lookupVendorPayoutByTransfer(serviceClient, transferId, scope))
  }

  if (matched.length === 0) {
    // TS narrowing struggles with the union here (lastReason is mutated inside
    // a closure in processOutcome) — extract the kind explicitly to avoid the
    // 'never' inference confusion.
    const reasonKind: LookupOutcome['kind'] | null = lastReason ? lastReason.kind : null
    if (reasonKind === 'query_error') {
      const msg = lastReason && lastReason.kind === 'query_error' ? lastReason.message : 'unknown'
      warnings.push(`Database query error: ${msg}`)
    } else if (reasonKind === 'cross_vertical') {
      warnings.push('Object exists in our database but is in a different vertical than you have access to.')
    } else {
      warnings.push('Stripe object found, but no matching record in our database. Possible orphan or unrelated transaction.')
    }
  }

  return {
    stripeObject,
    matchedOrders: matched,
    metadataCompleteness: completeness,
    warnings,
  }
}

// ── Reverse lookups (DB-only, no Stripe API calls) ───────────────────

export async function reconcileByOrderNumber(
  serviceClient: SupabaseClient,
  orderNumber: string,
  scope: ScopeFilter,
): Promise<MatchResult> {
  const r = await lookupOrderByNumber(serviceClient, orderNumber, scope, 'reverse_lookup_order_number')
  if (r.kind === 'matched') {
    return {
      stripeObject: null,
      matchedOrders: [r.order],
      metadataCompleteness: evaluateMetadata({}),
      warnings: [],
    }
  }
  const warning =
    r.kind === 'query_error' ? `Database query error: ${r.message}` :
    r.kind === 'cross_vertical' ? 'Order exists but is in a different vertical than you have access to.' :
    `No order found with number "${orderNumber}".`
  return {
    stripeObject: null,
    matchedOrders: [],
    metadataCompleteness: evaluateMetadata({}),
    warnings: [warning],
  }
}

export async function reconcileByEmail(
  serviceClient: SupabaseClient,
  email: string,
  scope: ScopeFilter,
  limit = 25,
): Promise<MatchResult> {
  // Find user by email
  const { data: profile } = await serviceClient
    .from('user_profiles')
    .select('user_id')
    .ilike('email', email)
    .maybeSingle()

  if (!profile?.user_id) {
    return {
      stripeObject: null,
      matchedOrders: [],
      metadataCompleteness: evaluateMetadata({}),
      warnings: [`No user found with email "${email}".`],
    }
  }

  // List orders for this buyer
  let query = serviceClient
    .from('orders')
    .select('id, vertical_id')
    .eq('buyer_user_id', profile.user_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!scope.isPlatformAdmin && scope.effectiveVerticalId) {
    query = query.eq('vertical_id', scope.effectiveVerticalId)
  }

  const { data: orders } = await query
  if (!orders || orders.length === 0) {
    return {
      stripeObject: null,
      matchedOrders: [],
      metadataCompleteness: evaluateMetadata({}),
      warnings: [`No orders found for "${email}" within your access scope.`],
    }
  }

  const matches: MatchedOrder[] = []
  for (const o of orders) {
    const r = await lookupOrderById(serviceClient, o.id as string, scope, 'reverse_lookup_email')
    if (r.kind === 'matched') matches.push(r.order)
  }

  return {
    stripeObject: null,
    matchedOrders: matches,
    metadataCompleteness: evaluateMetadata({}),
    warnings: matches.length === limit ? [`Showing the most recent ${limit} orders. Use a more specific search for older.`] : [],
  }
}

// ── Payout audit ─────────────────────────────────────────────────────

/**
 * Audit a single Stripe payout — returns balance transactions with each
 * source-object reconciled. ~2 Stripe API calls upfront (payout + BT list).
 * Source-object reconciliation is DB-only; no further Stripe calls.
 */
export async function reconcilePayout(
  serviceClient: SupabaseClient,
  payoutId: string,
  scope: ScopeFilter,
): Promise<PayoutAuditResult | { error: string }> {
  let payout
  try {
    payout = await stripe.payouts.retrieve(payoutId)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }

  const stripeObject = await buildReconcileStripeObject('payout', payout as unknown as Record<string, unknown>)

  // List balance transactions in this payout. `expand: ['data.source']` inlines
  // the source object so we can read charge.payment_intent without a per-line
  // extra API call. Still 1 list call total (max 100 BTs per page).
  // Note: `payments.stripe_charge_id` is currently never populated by webhooks
  // or checkout-success (verified Session 76); matching MUST go via PI ID.
  let bts
  try {
    bts = await stripe.balanceTransactions.list({
      payout: payoutId,
      limit: 100,
      expand: ['data.source'],
    })
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }

  const lines: PayoutAuditResult['lines'] = []
  let grossCents = 0
  let feeCents = 0
  let netCents = 0

  // Cap how many extra source retrievals we'll do (when expand didn't inline
  // the source). Protects against runaway API calls on giant payouts. Past
  // this many unmatched-with-string-source lines we stop retrieving and
  // surface a "retrieve cap reached" diagnostic.
  const MAX_SOURCE_RETRIEVES = 50
  let retrievesUsed = 0

  for (const bt of bts.data) {
    // Skip the payout BT itself when computing totals — it's a negative sweep
    // that cancels everything (gross == fees, net == 0 otherwise).
    if (bt.type !== 'payout') {
      grossCents += bt.amount
      feeCents += bt.fee
      netCents += bt.net
    }

    // Resolve sourceId. After expand, source SHOULD be an object — but the
    // Stripe API doesn't always honor expand for every source type, so we
    // handle both string and object forms here.
    let sourceId: string | null = null
    let chargePaymentIntentId: string | null = null
    let sourceWasExpanded = false
    if (bt.source) {
      if (typeof bt.source === 'string') {
        sourceId = bt.source
      } else {
        sourceWasExpanded = true
        const sourceObj = bt.source as { id?: string; payment_intent?: string | null }
        sourceId = sourceObj.id || null
        chargePaymentIntentId = (sourceObj.payment_intent as string) || null
      }
    }

    // Treat both 'charge' (legacy + non-Connect) and 'payment' (newer
    // PaymentIntent-driven, common on Connect platforms) BT types as
    // charge-like. Source may use 'ch_' prefix or 'py_' prefix (the
    // latter is the Connect "payment" alias for Charge).
    const isChargeLike = bt.type === 'charge' || bt.type === 'payment'

    let match: MatchResult | null = null
    let diagnostic: string | undefined = undefined

    if (isChargeLike) {
      // If we don't have the PI yet (source wasn't expanded into an object),
      // retrieve the charge to get it.
      if (!chargePaymentIntentId && sourceId) {
        if (retrievesUsed < MAX_SOURCE_RETRIEVES) {
          retrievesUsed += 1
          try {
            const charge = await stripe.charges.retrieve(sourceId)
            chargePaymentIntentId = (charge.payment_intent as string) || null
            if (!chargePaymentIntentId) {
              diagnostic = `${bt.type} ${sourceId} has no payment_intent (probably a manual charge or pre-PI legacy)`
            }
          } catch (err) {
            diagnostic = `Failed to retrieve charge ${sourceId}: ${err instanceof Error ? err.message : String(err)}`
          }
        } else {
          diagnostic = `Source not expanded and retrieve cap reached (${MAX_SOURCE_RETRIEVES} per payout)`
        }
      } else if (!chargePaymentIntentId && sourceWasExpanded) {
        diagnostic = `Source expanded but no payment_intent field — likely a refund or non-charge object`
      }

      if (chargePaymentIntentId) {
        const result = await matchByPaymentIntentDetailed(serviceClient, chargePaymentIntentId, scope)
        if (result.outcome === 'matched') {
          match = {
            stripeObject: null,
            matchedOrders: [result.order],
            metadataCompleteness: evaluateMetadata({}),
            warnings: [],
          }
        } else {
          diagnostic = result.reason
        }
      } else if (!diagnostic) {
        diagnostic = 'No payment_intent ID available for matching'
      }
    } else if (bt.type === 'transfer' && sourceId) {
      const r = await lookupVendorPayoutByTransfer(serviceClient, sourceId, scope)
      if (r.kind === 'matched') {
        match = {
          stripeObject: null,
          matchedOrders: [r.order],
          metadataCompleteness: evaluateMetadata({}),
          warnings: [],
        }
      } else if (r.kind === 'query_error') {
        diagnostic = `Transfer ${sourceId} lookup failed: ${r.message}`
      } else if (r.kind === 'cross_vertical') {
        diagnostic = `Transfer ${sourceId} maps to a different vertical than you have access to`
      } else {
        diagnostic = `Transfer ${sourceId} has no matching vendor_payouts row (stripe_transfer_id may not have been recorded)`
      }
    } else if (bt.type === 'payout') {
      diagnostic = 'Payout sweep — not matched to an order by design'
    } else {
      diagnostic = `BT type "${bt.type}" not currently matched`
    }

    lines.push({
      balanceTransactionId: bt.id,
      type: bt.type,
      amountCents: bt.amount,
      netCents: bt.net,
      feeCents: bt.fee,
      sourceId,
      match,
      ...(diagnostic !== undefined ? { diagnostic } : {}),
    })
  }

  return {
    payout: stripeObject,
    lines,
    totals: { grossCents, feeCents, netCents },
  }
}

/**
 * Look up a PaymentIntent ID across all 3 charge-producing tables in priority
 * order: payments (regular orders) → market_box_subscriptions → event_company_payments.
 * Returns either the match OR an explanation string suitable for the diagnostic
 * column. The explanation distinguishes "not found anywhere" from "found but
 * cross-vertical" from "DB query failed" so the user can act on the right cause.
 */
async function matchByPaymentIntentDetailed(
  serviceClient: SupabaseClient,
  paymentIntentId: string,
  scope: ScopeFilter,
): Promise<{ outcome: 'matched'; order: MatchedOrder } | { outcome: 'no_match'; reason: string }> {
  const visited: Array<{ table: string; outcome: LookupOutcome }> = []

  // 1. Regular order via payments table
  const { data: pay, error: payErr } = await serviceClient
    .from('payments')
    .select('order_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (payErr) {
    visited.push({ table: 'payments', outcome: { kind: 'query_error', message: payErr.message } })
  } else if (pay?.order_id) {
    const r = await lookupOrderById(serviceClient, pay.order_id as string, scope, 'payments_payment_intent')
    if (r.kind === 'matched') return { outcome: 'matched', order: r.order }
    visited.push({ table: 'orders (via payments)', outcome: r })
  } else {
    visited.push({ table: 'payments', outcome: { kind: 'not_found' } })
  }

  // 2. Market box subscription
  const mb = await lookupMarketBoxSubByPI(serviceClient, paymentIntentId, scope)
  if (mb.kind === 'matched') return { outcome: 'matched', order: mb.order }
  visited.push({ table: 'market_box_subscriptions', outcome: mb })

  // 3. Event company payment
  const ecp = await lookupEventCompanyPaymentByPI(serviceClient, paymentIntentId, scope)
  if (ecp.kind === 'matched') return { outcome: 'matched', order: ecp.order }
  visited.push({ table: 'event_company_payments', outcome: ecp })

  // Compose a diagnostic from the most informative outcome
  const errors = visited.filter(v => v.outcome.kind === 'query_error') as Array<{ table: string; outcome: { kind: 'query_error'; message: string } }>
  if (errors.length > 0) {
    return {
      outcome: 'no_match',
      reason: `PI ${paymentIntentId} lookup hit DB error(s): ${errors.map(e => `${e.table}: ${e.outcome.message}`).join('; ')}`,
    }
  }
  const crossVerticals = visited.filter(v => v.outcome.kind === 'cross_vertical')
  if (crossVerticals.length > 0) {
    return {
      outcome: 'no_match',
      reason: `PI ${paymentIntentId} found in ${crossVerticals.map(v => v.table).join(' and ')} but maps to a different vertical than you have access to`,
    }
  }
  return {
    outcome: 'no_match',
    reason: `PI ${paymentIntentId} found on Stripe but no matching row in payments, market_box_subscriptions, or event_company_payments`,
  }
}
