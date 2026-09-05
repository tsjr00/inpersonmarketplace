/**
 * bundle_sold sweep (mig 244) — tells the market manager a bundle order was
 * paid, as the run-sheet call to action.
 *
 * Rides the HOURLY surveys cron as an independent block (no new vercel.json
 * entry, no protected-file touch — the paid flip happens in the webhook and
 * this sweep reads its result). Hourly latency is fine BY DESIGN: bundle
 * ordering closes at least assemblyBufferDays+1 before pickup
 * (lib/bundles/core.ts), so the manager never needs minute-level news.
 *
 * Dedup: one bundle_sold notification per ORDER, via the notifications table
 * (same house pattern as the vendor digest) — the sweep window and the dedup
 * read cover the same span, so a notified order can never re-notify.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { observed } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications/service'

const SWEEP_WINDOW_HOURS = 72

export interface BundleSoldSweepSummary {
  ordersConsidered: number
  managersNotified: number
  errors: string[]
}

export async function runBundleSoldSweep(
  serviceClient: SupabaseClient
): Promise<BundleSoldSweepSummary> {
  const summary: BundleSoldSweepSummary = { ordersConsidered: 0, managersNotified: 0, errors: [] }
  const since = new Date(Date.now() - SWEEP_WINDOW_HOURS * 60 * 60 * 1000).toISOString()

  const { data: orders } = await observed(serviceClient
    .from('orders')
    .select('id, order_number, vertical_id, bundle_id, created_at')
    .not('bundle_id', 'is', null)
    .in('status', ['paid', 'completed'])
    .gte('created_at', since), { table: 'orders' })
  if (!orders || orders.length === 0) return summary
  summary.ordersConsidered = orders.length

  // Already-notified orders (per-order dedup via the notifications table).
  const { data: priorNotifs } = await observed(serviceClient
    .from('notifications')
    .select('data')
    .eq('type', 'bundle_sold')
    .gte('created_at', since), { table: 'notifications' })
  const notifiedOrderIds = new Set(
    (priorNotifs ?? [])
      .map(n => (n.data as { orderId?: string } | null)?.orderId)
      .filter((id): id is string => !!id)
  )

  const pending = orders.filter(o => !notifiedOrderIds.has(o.id as string))
  if (pending.length === 0) return summary

  const bundleIds = [...new Set(pending.map(o => o.bundle_id as string))]
  const { data: bundles } = await observed(serviceClient
    .from('market_bundles')
    .select('id, name, market_id, pickup_market_date')
    .in('id', bundleIds), { table: 'market_bundles' })
  const bundleById = new Map((bundles ?? []).map(b => [b.id as string, b]))

  const marketIds = [...new Set((bundles ?? []).map(b => b.market_id as string))]
  const { data: markets } = await observed(serviceClient
    .from('markets')
    .select('id, name, manager_user_id')
    .in('id', marketIds.length ? marketIds : ['00000000-0000-0000-0000-000000000000']), { table: 'markets' })
  const marketById = new Map((markets ?? []).map(m => [m.id as string, m]))

  for (const order of pending) {
    const bundle = bundleById.get(order.bundle_id as string)
    const market = bundle ? marketById.get(bundle.market_id as string) : undefined
    if (!bundle || !market?.manager_user_id) continue
    try {
      await sendNotification(
        market.manager_user_id as string,
        'bundle_sold',
        {
          orderId: order.id as string,
          orderNumber: order.order_number as string,
          bundleName: bundle.name as string,
          marketDate: (bundle.pickup_market_date as string) || '',
          marketId: market.id as string,
          marketName: market.name as string,
        },
        (order.vertical_id ? { vertical: order.vertical_id as string } : {})
      )
      summary.managersNotified++
    } catch (err) {
      summary.errors.push(err instanceof Error ? err.message : 'Unknown send error')
    }
  }

  return summary
}
