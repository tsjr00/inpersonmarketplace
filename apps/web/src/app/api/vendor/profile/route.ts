import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { validatePaymentUsername, ExternalPaymentMethod } from '@/lib/payments/external-links'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

export async function PATCH(request: NextRequest) {
  return withErrorTracing('/api/vendor/profile', 'PATCH', async () => {
    // Rate limit vendor profile updates
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-profile:${clientIp}`, { limit: 20, windowSeconds: 60 })

    if (!rateLimitResult.success) {
      return rateLimitResponse(rateLimitResult)
    }

    try {
      const supabase = await createClient()

      // Auth
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const {
        vendorId,
        description,
        social_links,
        venmo_username,
        cashapp_cashtag,
        paypal_username,
        accepts_cash_at_pickup,
        pickup_lead_minutes,
        pickup_capacity,
        fee_discount_code
      } = await request.json()

      // Verify vendor ownership
      const { data: vendor } = await supabase
        .from('vendor_profiles')
        .select('id, user_id, tier, stripe_account_id')
        .eq('id', vendorId)
        .is('deleted_at', null)
        .single()

      if (!vendor || vendor.user_id !== user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      // Build update object
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString()
      }

      if (description !== undefined) {
        updates.description = description
      }

      // All vendors can save social links
      if (social_links !== undefined) {
        updates.social_links = social_links
      }

      // Payment method fields - require Stripe for external payments
      const hasExternalPayment = venmo_username || cashapp_cashtag || paypal_username || accepts_cash_at_pickup

      if (hasExternalPayment && !vendor.stripe_account_id) {
        return NextResponse.json({
          error: 'Stripe account must be connected before enabling external payment methods'
        }, { status: 400 })
      }

      // Validate and update Venmo username
      if (venmo_username !== undefined) {
        const validation = validatePaymentUsername('venmo', venmo_username)
        if (!validation.valid) {
          return NextResponse.json({ error: validation.error }, { status: 400 })
        }
        updates.venmo_username = validation.cleaned || null
      }

      // Validate and update Cash App tag
      if (cashapp_cashtag !== undefined) {
        const validation = validatePaymentUsername('cashapp', cashapp_cashtag)
        if (!validation.valid) {
          return NextResponse.json({ error: validation.error }, { status: 400 })
        }
        updates.cashapp_cashtag = validation.cleaned || null
      }

      // Validate and update PayPal username
      if (paypal_username !== undefined) {
        const validation = validatePaymentUsername('paypal', paypal_username)
        if (!validation.valid) {
          return NextResponse.json({ error: validation.error }, { status: 400 })
        }
        updates.paypal_username = validation.cleaned || null
      }

      // Update cash at pickup
      if (accepts_cash_at_pickup !== undefined) {
        updates.accepts_cash_at_pickup = Boolean(accepts_cash_at_pickup)
      }

      // Partner/grant discount code — free text, admin verifies
      if (fee_discount_code !== undefined) {
        updates.fee_discount_code = fee_discount_code || null
      }

      // Update pickup lead time (FT vendors: 15 or 30 minutes)
      if (pickup_lead_minutes !== undefined) {
        const leadVal = Number(pickup_lead_minutes)
        if (leadVal !== 15 && leadVal !== 30) {
          return NextResponse.json({ error: 'Pickup lead time must be 15 or 30 minutes' }, { status: 400 })
        }
        updates.pickup_lead_minutes = leadVal
      }

      // Pickup capacity (mig 216) — how many app pre-orders this truck accepts
      // per pickup slot. `null` clears it back to unlimited (today's behavior).
      // The enforced caps (app_orders / items) are derived client-side from the
      // three setup questions and may be overridden by the vendor, so validate
      // them here rather than trusting the arithmetic.
      if (pickup_capacity !== undefined) {
        if (pickup_capacity === null) {
          updates.pickup_capacity_total_per_slot = null
          updates.pickup_capacity_app_orders = null
          updates.pickup_capacity_avg_items = null
          updates.pickup_capacity_items = null
          updates.pickup_capacity_slot_minutes = null
        } else {
          const cap = pickup_capacity as Record<string, unknown>
          const num = (v: unknown): number | null => {
            if (v === null || v === undefined || v === '') return null
            const n = Number(v)
            return Number.isInteger(n) && n > 0 ? n : NaN
          }
          const total = num(cap.total_per_slot)
          const appOrders = num(cap.app_orders)
          const avgItems = num(cap.avg_items)
          const items = num(cap.items)
          const slotMinutes = num(cap.slot_minutes)

          if ([total, appOrders, avgItems, items, slotMinutes].some(Number.isNaN)) {
            return NextResponse.json({ error: 'Capacity values must be whole numbers greater than zero' }, { status: 400 })
          }
          if (slotMinutes !== null && slotMinutes !== 15 && slotMinutes !== 30) {
            return NextResponse.json({ error: 'Capacity slot length must be 15 or 30 minutes' }, { status: 400 })
          }
          // You cannot reserve more for app pre-orders than you can produce.
          if (total !== null && appOrders !== null && appOrders > total) {
            return NextResponse.json({ error: "Your app slice can't be larger than the total orders you complete in a slot" }, { status: 400 })
          }
          updates.pickup_capacity_total_per_slot = total
          updates.pickup_capacity_app_orders = appOrders
          updates.pickup_capacity_avg_items = avgItems
          updates.pickup_capacity_items = items
          updates.pickup_capacity_slot_minutes = slotMinutes
        }
      }

      // Update
      const { error: updateError } = await supabase
        .from('vendor_profiles')
        .update(updates)
        .eq('id', vendorId)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  })
}
