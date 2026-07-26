import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { parseRequiredDocs, requiredDocLabel, type RequiredDocEntry } from '@/lib/markets/required-docs'
import { sendNotification } from '@/lib/notifications'

type ServiceClient = ReturnType<typeof createServiceClient>

/**
 * GET  /api/market-manager/[marketId]/required-docs
 *   Returns { required_docs: RequiredDocEntry[] }
 *
 * PATCH /api/market-manager/[marketId]/required-docs
 *   Body: { required_docs: RequiredDocEntry[] }  (empty array clears)
 *
 * Tester finding P4b (2026-07-15) → structured (2026-07-23): operators tell
 * trucks which documents to carry to book. Originally free text
 * (required_docs_note, mig 192); now a structured checkbox list of the standard
 * food-truck permits + repeatable "Other" entries (required_docs JSONB, mig 206).
 * Display-only at booking; enforcement stays human review (book-then-vet).
 *
 * PRE-MIGRATION SAFE: a select/update error on the required_docs column (mig 206
 * not applied) degrades to an empty list rather than failing the card. Auth:
 * assigned manager of the market.
 */

async function authorize(
  marketId: string,
  request: NextRequest
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`mm-required-docs:${clientIp}`, rateLimits.api)
  if (!rateLimitResult.success) {
    return { ok: false, response: rateLimitResponse(rateLimitResult) }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

  const allowed = await isMarketManager(supabase, marketId, user)
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 }),
    }
  }
  return { ok: true }
}

/** Stable identity for a doc entry so we can diff old vs new: standard entries
 *  key on their type; "other" entries key on their (trimmed) label so two
 *  different custom docs aren't treated as the same. */
function docIdentity(e: RequiredDocEntry): string {
  return e.key === 'other' ? `other:${(e.label || '').trim().toLowerCase()}` : e.key
}

/** "A", "A and B", "A, B, and C". */
function formatDocList(labels: string[]): string {
  if (labels.length === 0) return 'an additional document'
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`
}

/**
 * Tell trucks already engaged with this park that a NEW required document was
 * added, so the requirement reaches vendors who won't see it on the book-spot
 * page (they've already booked). "Engaged" = an upcoming paid/completed spot
 * booking OR an active/requested recurring hold. In-app only (free, page-load);
 * informational — book-then-vet means it never blocks their existing bookings.
 * Best-effort: caller wraps this so a notification failure never fails the save.
 */
async function notifyEngagedTrucksOfNewDocs(
  serviceClient: ServiceClient,
  args: { marketId: string; marketName: string; vertical: string; addedLabels: string[] }
): Promise<void> {
  const { marketId, marketName, vertical, addedLabels } = args
  const today = new Date().toISOString().slice(0, 10)

  const { data: bookings } = await serviceClient
    .from('park_spot_bookings')
    .select('vendor_profile_id')
    .eq('market_id', marketId)
    .in('status', ['paid', 'completed'])
    .gte('booking_date', today)

  const { data: standing } = await serviceClient
    .from('park_standing_reservations')
    .select('vendor_profile_id')
    .eq('market_id', marketId)
    .in('status', ['requested', 'active'])

  const vpIds = new Set<string>()
  for (const b of bookings ?? []) if (b.vendor_profile_id) vpIds.add(b.vendor_profile_id as string)
  for (const s of standing ?? []) if (s.vendor_profile_id) vpIds.add(s.vendor_profile_id as string)
  if (vpIds.size === 0) return

  const { data: vps } = await serviceClient
    .from('vendor_profiles')
    .select('id, user_id')
    .in('id', Array.from(vpIds))

  const docLabels = formatDocList(addedLabels)
  for (const vp of vps ?? []) {
    const userId = vp.user_id as string | null
    if (!userId) continue
    // sendNotification never throws; awaited so it completes before the route
    // returns (Vercel terminates the function after the response).
    await sendNotification(
      userId,
      'park_required_docs_updated',
      { marketName, marketId, vertical, docLabels },
      { vertical }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/required-docs', 'GET', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()
    crumb.supabase('select', 'markets')
    const { data, error } = await serviceClient
      .from('markets')
      .select('required_docs')
      .eq('id', marketId)
      .maybeSingle()

    // PRE-MIGRATION SAFE: column absent (mig 206 unapplied) → empty list, not a
    // 500. The card shows "no documents listed yet" until the migration lands.
    if (error) {
      return NextResponse.json({ required_docs: [] })
    }
    if (!data) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    return NextResponse.json({ required_docs: parseRequiredDocs(data.required_docs) })
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/required-docs', 'PATCH', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    if (!Array.isArray(body?.required_docs)) {
      throw traced.validation('ERR_VALIDATION_001', 'required_docs must be an array')
    }
    // Normalize + validate: drops unknown keys, de-dupes standard keys, trims +
    // caps custom labels, drops label-less "other" entries.
    const cleaned = parseRequiredDocs(body.required_docs)

    const serviceClient = createServiceClient()

    // Read current docs + market context BEFORE the update so we can diff for
    // notifications (only NEWLY-added docs need to reach engaged trucks) and
    // build the notification copy. Tolerant: a missing column (mig 206
    // unapplied) yields an empty prior list — everything reads as "added", but
    // the update below would then also fail, so the notify path won't run.
    crumb.supabase('select', 'markets')
    const { data: before } = await serviceClient
      .from('markets')
      .select('required_docs, name, vertical_id')
      .eq('id', marketId)
      .maybeSingle()

    crumb.supabase('update', 'markets')
    const { data, error } = await serviceClient
      .from('markets')
      .update({ required_docs: cleaned })
      .eq('id', marketId)
      .select('required_docs')
      .maybeSingle()

    if (error) {
      throw traced.fromSupabase(error, { table: 'markets', operation: 'update' })
    }
    if (!data) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    // Notify engaged trucks about docs that are newly required (additions only —
    // removals need no vendor action). Never let a notification failure fail the
    // operator's save.
    try {
      const prevKeys = new Set(parseRequiredDocs(before?.required_docs).map(docIdentity))
      const addedLabels = cleaned
        .filter((e) => !prevKeys.has(docIdentity(e)))
        .map(requiredDocLabel)
      if (addedLabels.length > 0) {
        await notifyEngagedTrucksOfNewDocs(serviceClient, {
          marketId,
          marketName: (before?.name as string) || 'your park',
          vertical: (before?.vertical_id as string) || 'food_trucks',
          addedLabels,
        })
      }
    } catch {
      // Best-effort — the save already succeeded.
    }

    return NextResponse.json({ required_docs: parseRequiredDocs(data.required_docs) })
  })
}
