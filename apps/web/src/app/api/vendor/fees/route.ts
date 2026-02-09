import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getVendorFeeBalance, getVendorFeeLedger, BALANCE_INVOICE_THRESHOLD_CENTS, AGE_INVOICE_THRESHOLD_DAYS } from '@/lib/payments/vendor-fees'
import { withErrorTracing } from '@/lib/errors'

/**
 * GET /api/vendor/fees
 *
 * Returns vendor's current fee balance and ledger history
 */
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor/fees', 'GET', async () => {
    try {
      const supabase = await createClient()

      // Auth
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Get vendor profile
      const searchParams = request.nextUrl.searchParams
      const vendorId = searchParams.get('vendor_id')

      if (!vendorId) {
        return NextResponse.json({ error: 'vendor_id is required' }, { status: 400 })
      }

      // Verify ownership
      const { data: vendor } = await supabase
        .from('vendor_profiles')
        .select('id, user_id')
        .eq('id', vendorId)
        .single()

      if (!vendor || vendor.user_id !== user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      // Get balance
      const { balanceCents, oldestUnpaidAt, requiresPayment } = await getVendorFeeBalance(
        supabase,
        vendorId
      )

      // Get ledger
      const ledger = await getVendorFeeLedger(supabase, vendorId, 50)

      return NextResponse.json({
        balance_cents: balanceCents,
        oldest_unpaid_at: oldestUnpaidAt?.toISOString() || null,
        requires_payment: requiresPayment,
        thresholds: {
          balance_cents: BALANCE_INVOICE_THRESHOLD_CENTS,
          age_days: AGE_INVOICE_THRESHOLD_DAYS
        },
        ledger: ledger.map(entry => ({
          id: entry.id,
          order_id: entry.orderId,
          amount_cents: entry.amountCents,
          type: entry.type,
          description: entry.description,
          created_at: entry.createdAt
        }))
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  })
}
