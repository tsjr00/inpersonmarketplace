import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, observed } from '@/lib/errors'
import { verifyAdminScope } from '@/lib/auth/admin'
import { taxReversalForOrderItem, recordTaxReversal, TAX_REVERSAL_QUEUE } from '@/lib/tax/refund-ledger'
import type { ItemTaxSnapshot, RefundPortion, TaxReversal } from '@/lib/tax/refund-tax'

/**
 * POST /api/admin/tax-reversals/[id]/resolve
 *   { allocations: [{ orderItemId, portion: 'full' | <percent 1–100> }], note? }
 *
 * The admin's allocation of a partial Stripe-dashboard refund to the items it
 * covered (owner Q2, 2026-09-24). For each ticked item: the reversal is the
 * item's frozen snapshot — whole, or the given percent of its base — capped by
 * what earlier refunds already reversed (lib/tax/refund-tax.ts), written as ONE
 * dashboard_refund ledger row keyed by the queue row's Stripe refund id (a
 * repeat submit is a duplicate, never a second row). Then the queue row is
 * closed with who / when / note. An empty allocation is allowed only with a
 * note ("no tax on the refunded part", say) — the row still closes.
 *
 * All ledger READS happen before the first write, so a read failure aborts
 * with nothing recorded. Never touches Stripe or refund_amount_cents — the
 * money already moved in the dashboard; this is the return's bookkeeping.
 * Platform admins only; service client after that check (service-only tables).
 */
type Allocation = { orderItemId: string; portion: 'full' | number }

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withErrorTracing('/api/admin/tax-reversals/[id]/resolve', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const scope = await verifyAdminScope(null)
    if (!scope) return NextResponse.json({ error: 'Unauthorized', code: 'ERR_AUTH_001' }, { status: 401 })
    if (!scope.isPlatformAdmin) return NextResponse.json({ error: 'Platform admin access required', code: 'ERR_AUTH_002' }, { status: 403 })

    // Validation answers are explicit 400s (the sibling admin routes' shape):
    // the traced status map has no entry for validation codes.
    const bad = (message: string) => NextResponse.json({ error: message, code: 'ERR_VALIDATION_001' }, { status: 400 })

    const { id } = await context.params
    if (!/^[0-9a-f-]{36}$/i.test(id)) return bad('Invalid queue row id')

    const body = await request.json().catch(() => ({})) as { allocations?: unknown; note?: unknown }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : ''
    if (!Array.isArray(body.allocations)) return bad('allocations must be an array')
    const allocations: Allocation[] = []
    for (const raw of body.allocations as unknown[]) {
      const a = raw as { orderItemId?: unknown; portion?: unknown }
      if (typeof a?.orderItemId !== 'string' || !a.orderItemId) return bad('Each allocation needs an orderItemId')
      const portion = a.portion === 'full' ? 'full' : Number(a.portion)
      if (portion !== 'full' && (!Number.isFinite(portion) || portion <= 0 || portion > 100)) {
        return bad('portion must be "full" or a percent between 1 and 100')
      }
      if (allocations.some((x) => x.orderItemId === a.orderItemId)) return bad('An item is listed twice')
      allocations.push({ orderItemId: a.orderItemId, portion })
    }
    if (allocations.length === 0 && !note) {
      return bad('Pick the item(s) the refund covered, or add a note explaining why no tax is reversed.')
    }

    const service = createServiceClient()
    const { data: row } = await observed(service
      .from(TAX_REVERSAL_QUEUE)
      .select('id, order_id, stripe_refund_id, refund_amount_cents, resolved_at')
      .eq('id', id)
      .maybeSingle(), { table: TAX_REVERSAL_QUEUE })
    if (!row) return NextResponse.json({ error: 'Queue row not found', code: 'ERR_NOT_FOUND' }, { status: 404 })
    if (row.resolved_at) return NextResponse.json({ error: 'This refund has already been allocated.' }, { status: 409 })

    // The items the admin may allocate to: live items of THAT order only.
    const { data: items, error: itemsErr } = await observed(service
      .from('order_items')
      .select('id, tax_amount_cents, taxable_amount_cents, tax_jurisdictions, tax_rate_version')
      .eq('order_id', row.order_id)
      .is('cancelled_at', null), { table: 'order_items' })
    if (itemsErr) throw itemsErr
    const byId = new Map(((items ?? []) as Array<{ id: string } & ItemTaxSnapshot>).map((i) => [i.id, i]))
    for (const a of allocations) {
      if (!byId.has(a.orderItemId)) return bad(`Item ${a.orderItemId} is not a live item on this order`)
    }

    // Reads first (each throws on a ledger failure), writes after.
    const planned: Array<{ orderItemId: string; reversal: TaxReversal }> = []
    for (const a of allocations) {
      const snapshot = byId.get(a.orderItemId)!
      const portion: RefundPortion = a.portion === 'full'
        ? { kind: 'full' }
        : { kind: 'partial', refundedBaseCents: Math.round(((snapshot.taxable_amount_cents ?? 0) * a.portion) / 100) }
      planned.push({ orderItemId: a.orderItemId, reversal: await taxReversalForOrderItem(service, a.orderItemId, snapshot, portion) })
    }
    const results: Array<{ orderItemId: string; taxCents: number; outcome: string }> = []
    for (const p of planned) {
      const outcome = await recordTaxReversal(service, {
        orderItemId: p.orderItemId, orderId: row.order_id as string, kind: 'dashboard_refund',
        refundRef: row.stripe_refund_id as string, reversal: p.reversal, route: '/api/admin/tax-reversals/[id]/resolve',
      })
      results.push({ orderItemId: p.orderItemId, taxCents: p.reversal.taxCents, outcome })
    }

    const { error: closeErr } = await service
      .from(TAX_REVERSAL_QUEUE)
      .update({ resolved_at: new Date().toISOString(), resolved_by: scope.userId, note: note || null })
      .eq('id', id)
    if (closeErr) throw closeErr

    return NextResponse.json({ resolved: true, results, taxReversedCents: results.reduce((s, r) => s + r.taxCents, 0) })
  })
}
