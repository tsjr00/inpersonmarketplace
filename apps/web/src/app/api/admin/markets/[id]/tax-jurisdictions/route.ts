import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'
import { verifyAdminScope } from '@/lib/auth/admin'
import {
  validateJurisdictions,
  totalRatePct,
  parseJurisdictions,
  type TaxJurisdiction,
  type JurisdictionLevel,
} from '@/lib/tax/jurisdictions'

interface RouteContext {
  params: Promise<{ id: string }>
}

const LEVELS: JurisdictionLevel[] = ['state', 'city', 'county', 'transit', 'spd']

/**
 * Texas sales-tax jurisdictions for a market (mig 214).
 *
 * Set at APPROVAL time, alongside lat/long — the admin already has the address
 * in front of them, and the jurisdiction set follows from that address. We are
 * pickup-only, so resolving once per market covers every order placed there.
 *
 * Auth: verifyAdminScope(market.vertical_id) — platform admins and the
 * vertical's own admins, matching how markets are administered elsewhere.
 *
 * Nothing here calculates or charges tax. This is reference data that a later,
 * separately-gated build will read.
 */

async function loadMarket(service: ReturnType<typeof createServiceClient>, id: string) {
  const { data } = await service
    .from('markets')
    .select('id, name, vertical_id, address, city, state, zip, tax_jurisdictions, tax_rate_total_pct, tax_rate_version, tax_jurisdiction_verified_at, tax_jurisdiction_note')
    .eq('id', id)
    .maybeSingle()
  return data
}

// GET — current jurisdictions + the address they should be resolved from
export async function GET(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/markets/[id]/tax-jurisdictions', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const service = createServiceClient()
    const { id } = await context.params
    const market = await loadMarket(service, id)
    if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 })

    const scope = await verifyAdminScope(market.vertical_id as string | null)
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!scope.authorized) {
      return NextResponse.json({ error: "Not authorized for this market's vertical" }, { status: 403 })
    }

    // Pre-mig-214 environments simply report nothing configured.
    const jurisdictions = parseJurisdictions(market.tax_jurisdictions)
    return NextResponse.json({
      jurisdictions,
      totalRatePct: (market.tax_rate_total_pct as number | null) ?? totalRatePct(jurisdictions),
      rateVersion: (market.tax_rate_version as string | null) ?? null,
      verifiedAt: (market.tax_jurisdiction_verified_at as string | null) ?? null,
      note: (market.tax_jurisdiction_note as string | null) ?? null,
      address: {
        line: (market.address as string | null) ?? null,
        city: (market.city as string | null) ?? null,
        state: (market.state as string | null) ?? null,
        zip: (market.zip as string | null) ?? null,
      },
    })
  })
}

// PUT — replace the jurisdiction set. Server-side validation is authoritative;
// the client's live checks are convenience only.
export async function PUT(request: NextRequest, context: RouteContext) {
  return withErrorTracing('/api/admin/markets/[id]/tax-jurisdictions', 'PUT', async () => {
    const clientIp = getClientIp(request)
    const rl = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
    if (!rl.success) return rateLimitResponse(rl)

    const service = createServiceClient()
    const { id } = await context.params
    const market = await loadMarket(service, id)
    if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 })

    const scope = await verifyAdminScope(market.vertical_id as string | null)
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!scope.authorized) {
      return NextResponse.json({ error: "Not authorized for this market's vertical" }, { status: 403 })
    }

    const body = await request.json()
    const { jurisdictions: rawJurisdictions, rateVersion, note } = body as {
      jurisdictions?: unknown
      rateVersion?: string
      note?: string
    }

    if (!Array.isArray(rawJurisdictions)) {
      return NextResponse.json({ error: 'jurisdictions must be an array' }, { status: 400 })
    }

    // Normalize BEFORE validating — the Comptroller publishes rates as decimals
    // (.015000) while we store percent (1.5). Accept either and normalize, so a
    // paste from the state's table can't silently under-charge by 100x.
    const normalized: TaxJurisdiction[] = []
    for (const raw of rawJurisdictions as Array<Record<string, unknown>>) {
      const code = String(raw?.code ?? '').trim()
      const name = String(raw?.name ?? '').trim()
      const level = String(raw?.level ?? '') as JurisdictionLevel
      const rateNum = Number(raw?.rate_pct)

      if (!LEVELS.includes(level)) {
        return NextResponse.json({ error: `Invalid jurisdiction level "${raw?.level}"` }, { status: 400 })
      }
      if (!Number.isFinite(rateNum) || rateNum < 0) {
        return NextResponse.json({ error: `Invalid rate for "${name || code}"` }, { status: 400 })
      }
      normalized.push({
        code,
        name,
        level,
        // A value < 0.25 is a decimal form (.015 = 1.5%); no real Texas local
        // rate is below 0.25% expressed as percent, so this is unambiguous.
        rate_pct: rateNum > 0 && rateNum < 0.25 ? Math.round(rateNum * 100 * 10000) / 10000 : rateNum,
      })
    }

    const errors = validateJurisdictions(normalized)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' · '), errors }, { status: 400 })
    }

    const total = totalRatePct(normalized)
    const { error: updateError } = await service
      .from('markets')
      .update({
        tax_jurisdictions: normalized,
        tax_rate_total_pct: total,
        tax_rate_version: rateVersion?.trim() || null,
        tax_jurisdiction_verified_at: new Date().toISOString(),
        tax_jurisdiction_note: note?.trim() || null,
      })
      .eq('id', id)

    if (updateError) {
      // Pre-migration environments will fail here with an unknown-column error.
      return NextResponse.json(
        { error: `Could not save jurisdictions (is migration 214 applied?): ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, jurisdictions: normalized, totalRatePct: total })
  })
}
