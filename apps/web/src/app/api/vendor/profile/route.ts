import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { validatePaymentUsername, ExternalPaymentMethod } from '@/lib/payments/external-links'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export async function PATCH(request: Request) {
  // Rate limit vendor profile updates
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`vendor-profile:${clientIp}`, { limit: 20, windowSeconds: 60 })

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
      accepts_cash_at_pickup
    } = await request.json()

    // Verify vendor ownership
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id, user_id, tier, stripe_account_id')
      .eq('id', vendorId)
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

    // Only premium can save social links
    if (social_links !== undefined && (vendor.tier === 'premium' || vendor.tier === 'featured')) {
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
}
