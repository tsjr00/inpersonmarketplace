import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, observed } from '@/lib/errors'
import { verifyAdminScope } from '@/lib/auth/admin'
import { TAX_REVERSAL_LEDGER, TAX_REVERSAL_QUEUE } from '@/lib/tax/refund-ledger'

/**
 * GET /api/admin/tax-reversals?status=open|resolved
 *
 * The sales-tax "reversal owed" queue (owner Q2, 2026-09-24; built
 * 2026-09-26): partial refunds made by hand in the Stripe dashboard on taxed
 * orders. The webhook knows the amount but not the items, so an admin says
 * which items the refund covered (POST …/[id]/resolve) and the ledger rows are
 * written from that — never a pro-rata guess, because a guess would go on the
 * tax return.
 *
 * Open rows carry the order's LIVE items with tax paid / already reversed /
 * remaining, so the admin can allocate. Resolved rows carry what was
 * allocated. Platform admins only (accounting is platform-admin work); the
 * service client is used after that check because both tables are
 * service-only (mig 260). Read-only.
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/admin/tax-reversals', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const scope = await verifyAdminScope(null)
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!scope.isPlatformAdmin) return NextResponse.json({ error: 'Platform admin access required' }, { status: 403 })

    const status = new URL(request.url).searchParams.get('status') === 'resolved' ? 'resolved' : 'open'
    const service = createServiceClient()

    let rowsQ = service
      .from(TAX_REVERSAL_QUEUE)
      .select('id, order_id, stripe_refund_id, refund_amount_cents, created_at, resolved_at, resolved_by, note, order:orders!inner ( order_number, vertical_id, created_at )')
      .order('created_at', { ascending: false })
      .limit(200)
    rowsQ = status === 'open' ? rowsQ.is('resolved_at', null) : rowsQ.not('resolved_at', 'is', null)
    const { data: rows, error } = await observed(rowsQ, { table: TAX_REVERSAL_QUEUE })
    if (error) throw error
    const queue = (rows ?? []) as Array<Record<string, unknown> & { order: Record<string, unknown> | Record<string, unknown>[] | null }>
    const orderIds = [...new Set(queue.map((r) => r.order_id as string))]

    // Live items per order (what the admin can allocate to) + tax already
    // reversed per item (any earlier refund, any kind) → remaining.
    const { data: items } = orderIds.length
      ? await observed(service
          .from('order_items')
          .select('id, order_id, subtotal_cents, tax_amount_cents, taxable_amount_cents, tax_rate_version, listing:listings ( title )')
          .in('order_id', orderIds)
          .is('cancelled_at', null), { table: 'order_items' })
      : { data: [] }
    const itemRows = (items ?? []) as Array<Record<string, unknown> & { listing: { title: string | null } | { title: string | null }[] | null }>
    const itemIds = itemRows.map((i) => i.id as string)
    const refundIds = queue.map((r) => r.stripe_refund_id as string)
    const { data: ledger } = itemIds.length
      ? await observed(service
          .from(TAX_REVERSAL_LEDGER)
          .select('order_item_id, tax_cents, refund_ref')
          .or(`order_item_id.in.(${itemIds.join(',')}),refund_ref.in.(${refundIds.map((r) => `"${r}"`).join(',')})`), { table: TAX_REVERSAL_LEDGER })
      : { data: [] }
    const ledgerRows = (ledger ?? []) as Array<{ order_item_id: string; tax_cents: number; refund_ref: string }>
    const reversedByItem = new Map<string, number>()
    const allocatedByRefund = new Map<string, Array<{ orderItemId: string; taxCents: number }>>()
    for (const l of ledgerRows) {
      reversedByItem.set(l.order_item_id, (reversedByItem.get(l.order_item_id) ?? 0) + l.tax_cents)
      if (refundIds.includes(l.refund_ref)) {
        allocatedByRefund.set(l.refund_ref, [...(allocatedByRefund.get(l.refund_ref) ?? []), { orderItemId: l.order_item_id, taxCents: l.tax_cents }])
      }
    }
    const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

    return NextResponse.json({
      status,
      rows: queue.map((r) => {
        const order = one(r.order)
        const orderItems = itemRows
          .filter((i) => i.order_id === r.order_id)
          .map((i) => {
            const taxPaid = (i.tax_amount_cents as number | null) ?? 0
            const reversed = reversedByItem.get(i.id as string) ?? 0
            return {
              id: i.id, title: one(i.listing)?.title ?? 'Item',
              subtotalCents: i.subtotal_cents, taxPaidCents: taxPaid, taxReversedCents: reversed,
              taxRemainingCents: Math.max(0, taxPaid - reversed), rateVersion: i.tax_rate_version,
            }
          })
        return {
          id: r.id, orderId: r.order_id, orderNumber: order?.order_number ?? null, vertical: order?.vertical_id ?? null,
          orderCreatedAt: order?.created_at ?? null, stripeRefundId: r.stripe_refund_id, refundAmountCents: r.refund_amount_cents,
          createdAt: r.created_at, resolvedAt: r.resolved_at, resolvedBy: r.resolved_by, note: r.note,
          items: orderItems,
          allocated: allocatedByRefund.get(r.stripe_refund_id as string) ?? [],
        }
      }),
    })
  })
}
