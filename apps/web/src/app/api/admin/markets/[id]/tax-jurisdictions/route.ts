import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, observed } from '@/lib/errors'
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
 * Normalize a place name for corroboration: uppercase, drop the state table's
 * "(Travis Co)" suffix, and strip punctuation/spacing. "Austin (Travis Co)" and
 * "austin" both become "AUSTIN".
 */
function normalizePlace(name: string): string {
  return (name || '')
    .replace(/\([^)]*\)/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

/**
 * Soft corroboration that the entered jurisdictions belong to THIS market's
 * address. Returns warnings — not errors: the state's naming and an operator's
 * free-text city field legitimately differ, so this flags rather than blocks.
 */
function corroborateAgainstAddress(
  jurisdictions: TaxJurisdiction[],
  marketCity: string | null
): string[] {
  const warnings: string[] = []
  const cityRows = jurisdictions.filter((j) => j.level === 'city')
  if (marketCity && cityRows.length > 0) {
    const target = normalizePlace(marketCity)
    const matches = cityRows.some((j) => {
      const n = normalizePlace(j.name)
      return n.length > 0 && target.length > 0 && (n.includes(target) || target.includes(n))
    })
    if (!matches) {
      warnings.push(
        `City jurisdiction "${cityRows.map((c) => c.name).join(', ')}" does not match this market's city "${marketCity}" — double-check you resolved the right address.`
      )
    }
  }
  return warnings
}

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
  const { data } = await observed(service
    .from('markets')
    .select('id, name, vertical_id, address, city, state, zip, latitude, longitude, tax_jurisdictions, tax_rate_total_pct, tax_rate_version, tax_jurisdiction_verified_at, tax_jurisdiction_note')
    .eq('id', id)
    .maybeSingle(), { table: 'markets' })
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
    const verifiedAt = (market.tax_jurisdiction_verified_at as string | null) ?? null
    return NextResponse.json({
      jurisdictions,
      totalRatePct: (market.tax_rate_total_pct as number | null) ?? totalRatePct(jurisdictions),
      rateVersion: (market.tax_rate_version as string | null) ?? null,
      verifiedAt,
      // mig 215: the trigger clears verifiedAt when any address component
      // changes, so jurisdictions-without-a-stamp means the address moved out
      // from under them and they must be re-checked before they can be trusted.
      needsReverification: jurisdictions.length > 0 && !verifiedAt,
      warnings: corroborateAgainstAddress(jurisdictions, (market.city as string | null) ?? null),
      note: (market.tax_jurisdiction_note as string | null) ?? null,
      address: {
        line: (market.address as string | null) ?? null,
        city: (market.city as string | null) ?? null,
        state: (market.state as string | null) ?? null,
        zip: (market.zip as string | null) ?? null,
      },
      // Coordinates, because the Rate Locator's lat/long search is more reliable
      // than its address search (an address the state can't parse just errors)
      // and it is two fields instead of four. Sent as raw numbers; the card
      // formats them — PostgREST returns NUMERIC as a JSON number, so trailing
      // zeros are already gone by the time they arrive here.
      latitude: (market.latitude as number | null) ?? null,
      longitude: (market.longitude as number | null) ?? null,
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

    // Guardrail: these are TEXAS jurisdictions. A market in another state must
    // never carry them — that would be silently wrong tax data, and the whole
    // rate model (6.25% state, 8.25% ceiling) is Texas-specific.
    const marketState = ((market.state as string | null) || '').trim().toUpperCase()
    if (marketState && marketState !== 'TX' && marketState !== 'TEXAS') {
      errors.push(`This market is in ${marketState}; only Texas jurisdictions are supported today.`)
    }

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

    return NextResponse.json({
      success: true,
      jurisdictions: normalized,
      totalRatePct: total,
      warnings: corroborateAgainstAddress(normalized, (market.city as string | null) ?? null),
    })
  })
}
