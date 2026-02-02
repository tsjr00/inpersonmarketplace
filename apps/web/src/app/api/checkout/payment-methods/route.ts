import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

interface VendorPaymentMethods {
  vendor_profile_id: string
  vendor_name: string
  stripe_account_id: string | null
  venmo_username: string | null
  cashapp_cashtag: string | null
  paypal_username: string | null
  accepts_cash_at_pickup: boolean
}

interface AvailablePaymentMethod {
  id: 'stripe' | 'venmo' | 'cashapp' | 'paypal' | 'cash'
  name: string
  icon: string
  description: string
}

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/checkout/payment-methods', 'POST', async () => {
    const supabase = await createClient()
    const { vendorProfileIds } = await request.json() as { vendorProfileIds: string[] }

    if (!vendorProfileIds || vendorProfileIds.length === 0) {
      return NextResponse.json({ methods: [], vendors: [] })
    }

    crumb.auth('Checking user authentication')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    // Fetch payment methods for all vendors
    crumb.supabase('select', 'vendor_profiles')
    const { data: vendors, error } = await supabase
      .from('vendor_profiles')
      .select(`
        id,
        stripe_account_id,
        venmo_username,
        cashapp_cashtag,
        paypal_username,
        accepts_cash_at_pickup,
        profile_data
      `)
      .in('id', vendorProfileIds)

    if (error) {
      throw traced.fromSupabase(error, { table: 'vendor_profiles', operation: 'select' })
    }

    if (!vendors || vendors.length === 0) {
      return NextResponse.json({ methods: [], vendors: [] })
    }

    // Map vendor data
    const vendorPaymentMethods: VendorPaymentMethods[] = vendors.map(v => ({
      vendor_profile_id: v.id,
      vendor_name: (v.profile_data as Record<string, unknown>)?.business_name as string ||
                   (v.profile_data as Record<string, unknown>)?.farm_name as string ||
                   'Vendor',
      stripe_account_id: v.stripe_account_id,
      venmo_username: v.venmo_username,
      cashapp_cashtag: v.cashapp_cashtag,
      paypal_username: v.paypal_username,
      accepts_cash_at_pickup: v.accepts_cash_at_pickup || false
    }))

    // Determine which payment methods ALL vendors support
    // Only show a method if all vendors in the cart support it
    const allHaveStripe = vendors.every(v => v.stripe_account_id)
    const allHaveVenmo = vendors.every(v => v.venmo_username)
    const allHaveCashApp = vendors.every(v => v.cashapp_cashtag)
    const allHavePayPal = vendors.every(v => v.paypal_username)
    const allAcceptCash = vendors.every(v => v.accepts_cash_at_pickup)

    const availableMethods: AvailablePaymentMethod[] = []

    // Stripe is always first if available
    if (allHaveStripe) {
      availableMethods.push({
        id: 'stripe',
        name: 'Credit/Debit Card',
        icon: '💳',
        description: 'Pay securely with card'
      })
    }

    // External payment methods
    if (allHaveVenmo) {
      availableMethods.push({
        id: 'venmo',
        name: 'Venmo',
        icon: '📱',
        description: 'Pay via Venmo'
      })
    }

    if (allHaveCashApp) {
      availableMethods.push({
        id: 'cashapp',
        name: 'Cash App',
        icon: '💵',
        description: 'Pay via Cash App'
      })
    }

    if (allHavePayPal) {
      availableMethods.push({
        id: 'paypal',
        name: 'PayPal',
        icon: '🅿️',
        description: 'Pay via PayPal'
      })
    }

    if (allAcceptCash) {
      availableMethods.push({
        id: 'cash',
        name: 'Cash at Pickup',
        icon: '💰',
        description: 'Pay in cash when you pick up'
      })
    }

    return NextResponse.json({
      methods: availableMethods,
      vendors: vendorPaymentMethods
    })
  })
}
