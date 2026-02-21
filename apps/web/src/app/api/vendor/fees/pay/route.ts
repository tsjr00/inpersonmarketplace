import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getVendorFeeBalance } from '@/lib/payments/vendor-fees'
import { stripe } from '@/lib/stripe/config'
import { getStatementSuffix } from '@/lib/stripe/payments'
import { getAppUrl } from '@/lib/environment'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * POST /api/vendor/fees/pay
 *
 * Creates a Stripe Checkout session for vendor to pay their fee balance
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/fees/pay', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-fees-pay:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    try {
      const supabase = await createClient()

      // Auth
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { vendor_id, vertical_id } = await request.json()

      if (!vendor_id || !vertical_id) {
        return NextResponse.json({ error: 'vendor_id and vertical_id are required' }, { status: 400 })
      }

      // Verify ownership
      const { data: vendor } = await supabase
        .from('vendor_profiles')
        .select('id, user_id, business_name')
        .eq('id', vendor_id)
        .single()

      if (!vendor || vendor.user_id !== user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      // Get balance
      const { balanceCents } = await getVendorFeeBalance(supabase, vendor_id)

      if (balanceCents <= 0) {
        return NextResponse.json({ error: 'No balance to pay' }, { status: 400 })
      }

      // Get user email
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('email')
        .eq('user_id', user.id)
        .single()

      // Create Stripe Checkout session
      const baseUrl = getAppUrl()

      // Use idempotency key to prevent duplicate fee payment sessions on network retry
      const idempotencyKey = `vendor-fee-${vendor_id}-${balanceCents}`

      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          customer_email: profile?.email || undefined,
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: 'Platform Fee Balance',
                  description: `Outstanding platform fees for ${vendor.business_name || 'your vendor account'}`
                },
                unit_amount: balanceCents
              },
              quantity: 1
            }
          ],
          payment_intent_data: {
            statement_descriptor_suffix: getStatementSuffix(vertical_id),
          },
          metadata: {
            type: 'vendor_fee_payment',
            vendor_profile_id: vendor_id,
            amount_cents: balanceCents.toString()
          },
          success_url: `${baseUrl}/${vertical_id}/vendor/dashboard?fee_paid=true`,
          cancel_url: `${baseUrl}/${vertical_id}/vendor/dashboard?fee_cancelled=true`
        },
        {
          idempotencyKey
        }
      )

      return NextResponse.json({
        checkout_url: session.url
      })
    } catch (error: unknown) {
      console.error('Error creating fee payment session:', error instanceof Error ? error.message : 'Unknown error')
      const message = error instanceof Error ? error.message : 'Unknown error'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  })
}
