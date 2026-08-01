import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { getEventChipInConfig } from '@/lib/cause/beneficiaries'

// GET /api/buyer/chipin?marketId=<eventMarketId>
// Returns the Community Chip In offer for an event market (enabled + beneficiary
// id/name) so the checkout page can render the option. Auth-gated; reads via the
// service client because cause_beneficiaries is service-role-only. The offer is
// re-validated server-side at checkout (session route), so this is display-only.
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/buyer/chipin', 'GET', async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const marketId = request.nextUrl.searchParams.get('marketId')
    if (!marketId) {
      return NextResponse.json({ enabled: false, beneficiaryId: null, beneficiaryName: null })
    }

    const service = createServiceClient()
    const config = await getEventChipInConfig(service, marketId)
    return NextResponse.json({
      enabled: config.enabled,
      beneficiaryId: config.beneficiary?.id ?? null,
      beneficiaryName: config.beneficiary?.name ?? null,
    })
  })
}
