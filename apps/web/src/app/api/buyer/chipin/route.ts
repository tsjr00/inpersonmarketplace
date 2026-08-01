import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'
import { getEventChipInConfig, getActiveRoundUpCampaign } from '@/lib/cause/beneficiaries'

// GET /api/buyer/chipin?marketId=<cartMarketId>&vertical=<v>
// Returns the Community Chip In offers for a cart:
//   - event:   the event's chip-in (when the cart's market is a chip-in event)
//   - roundUp: an active round-up campaign covering the cart (Feature B)
// Auth-gated; reads via the service client (cause_* are service-role-only).
// Display-only — both are re-validated server-side at /api/checkout/session.
export async function GET(request: NextRequest) {
  return withErrorTracing('/api/buyer/chipin', 'GET', async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const marketId = request.nextUrl.searchParams.get('marketId')
    const vertical = request.nextUrl.searchParams.get('vertical')
    const service = createServiceClient()

    let event: { beneficiaryId: string; beneficiaryName: string } | null = null
    if (marketId) {
      const config = await getEventChipInConfig(service, marketId)
      if (config.enabled && config.beneficiary) {
        event = { beneficiaryId: config.beneficiary.id, beneficiaryName: config.beneficiary.name }
      }
    }

    let roundUp: { beneficiaryId: string; beneficiaryName: string } | null = null
    if (vertical) {
      const campaign = await getActiveRoundUpCampaign(service, vertical, marketId ?? '', new Date().toISOString())
      if (campaign) {
        roundUp = { beneficiaryId: campaign.beneficiary.id, beneficiaryName: campaign.beneficiary.name }
      }
    }

    return NextResponse.json({ event, roundUp })
  })
}
