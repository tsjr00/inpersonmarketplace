import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb, logError, TracedError, observed } from '@/lib/errors'
import { sendNotification } from '@/lib/notifications/service'
import { adminRecipientsForVertical } from '@/lib/notifications/admin-recipients'
import { marketTaxReadiness } from '@/lib/tax/readiness'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'
import {
  getVendorProfileForVertical,
} from '@/lib/vendor/getVendorProfile'
import {
  getTierLimits,
  getTraditionalMarketUsageExcludingListing,
  normalizeTier,
} from '@/lib/vendor-limits'

/**
 * POST /api/vendor/listings/[listingId]/markets
 *
 * Assigns a set of markets to a listing, enforcing the per-tier traditional
 * market cap (free=3, pro=5, boss=8). Replaces the existing set of
 * listing_markets rows with the provided set.
 *
 * Request body: { marketIds: string[] }
 *
 * Response contract:
 * - 200: { success: true, marketIds: [...] }
 * - 400: { error: "Market limit reached (...)", code: "ERR_MARKET_LIMIT", ... }
 *        — Client must NOT fall back; this is a legitimate cap rejection.
 * - 400: { error: "<validation message>", code: "ERR_VALIDATION_001" }
 *        — Client must NOT fall back; malformed request body.
 * - 401: { error: "Not authenticated" } — Unauthenticated.
 * - 404: { error: "Listing not found" } — Missing or not owned.
 * - 500: Any other error — Client MAY fall back to direct insert.
 *
 * Session 70 context: prior to this endpoint, listing market assignments
 * were written directly from the client via Supabase RLS. The tier cap was
 * never enforced because `getTraditionalMarketUsage` was broken (queried a
 * non-existent `listings.market_id` column). Both issues fixed together.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listingId: string }> }
) {
  const { listingId } = await params

  return withErrorTracing(
    `/api/vendor/listings/${listingId}/markets`,
    'POST',
    async () => {
      const clientIp = getClientIp(request)
      const rateLimitResult = await checkRateLimit(
        `vendor-listing-markets:${clientIp}`,
        rateLimits.submit
      )
      if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

      const supabase = await createClient()

      crumb.auth('Checking user authentication')
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json(
          { error: 'Not authenticated', code: 'ERR_AUTH_001' },
          { status: 401 }
        )
      }

      const body = await request.json()
      const { marketIds } = body as { marketIds?: unknown }

      if (!Array.isArray(marketIds)) {
        return NextResponse.json(
          { error: 'marketIds must be an array', code: 'ERR_VALIDATION_001' },
          { status: 400 }
        )
      }

      if (marketIds.some((id) => typeof id !== 'string' || !id)) {
        return NextResponse.json(
          {
            error: 'All marketIds must be non-empty strings',
            code: 'ERR_VALIDATION_001',
          },
          { status: 400 }
        )
      }

      const uniqueMarketIds = Array.from(new Set(marketIds as string[]))

      crumb.supabase('select', 'listings')
      const { data: listing, error: listingError } = await supabase
        .from('listings')
        .select('id, vendor_profile_id, vertical_id, is_taxable, title')
        .eq('id', listingId)
        .is('deleted_at', null)
        .single()

      if (listingError || !listing) {
        return NextResponse.json(
          { error: 'Listing not found', code: 'ERR_LISTING_001' },
          { status: 404 }
        )
      }

      crumb.supabase('select', 'vendor_profiles')
      const { profile: vendorProfile, error: vpError } =
        await getVendorProfileForVertical<{ id: string; tier: string | null }>(
          supabase,
          user.id,
          listing.vertical_id,
          'id, tier'
        )

      if (vpError || !vendorProfile) {
        return NextResponse.json(
          { error: vpError || 'Vendor profile not found', code: 'ERR_VENDOR_001' },
          { status: 404 }
        )
      }

      if (listing.vendor_profile_id !== vendorProfile.id) {
        return NextResponse.json(
          { error: 'Listing not found', code: 'ERR_LISTING_001' },
          { status: 404 }
        )
      }

      // Hoisted so the post-insert tax alert can read the chosen markets.
      let chosenMarkets: Array<Record<string, unknown>> = []

      if (uniqueMarketIds.length > 0) {
        crumb.supabase('select', 'markets', { check: 'types' })
        // Tax columns ride along for the owner-Q3 admin alert below (a
        // TAXABLE listing attached to a location without verified codes).
        const { data: markets, error: marketsError } = await supabase
          .from('markets')
          .select('id, name, market_type, tax_jurisdictions, tax_jurisdiction_verified_at, tax_rate_version')
          .in('id', uniqueMarketIds)
        chosenMarkets = markets || []

        if (marketsError) {
          throw traced.fromSupabase(marketsError, {
            table: 'markets',
            operation: 'select',
          })
        }

        const foundIds = new Set((markets || []).map((m) => m.id))
        const missing = uniqueMarketIds.filter((id) => !foundIds.has(id))
        if (missing.length > 0) {
          return NextResponse.json(
            {
              error: `Unknown market id(s): ${missing.join(', ')}`,
              code: 'ERR_VALIDATION_001',
            },
            { status: 400 }
          )
        }

        const proposedTraditionalIds = new Set(
          (markets || [])
            .filter((m) => m.market_type === 'traditional')
            .map((m) => m.id)
        )

        const tier = vendorProfile.tier || 'free'
        const tierLimits = getTierLimits(tier)

        crumb.logic('Computing new traditional market count')
        const existingUsage = await getTraditionalMarketUsageExcludingListing(
          supabase,
          vendorProfile.id,
          listingId
        )

        const combinedTraditionalIds = new Set(existingUsage.marketIds)
        for (const id of proposedTraditionalIds) {
          combinedTraditionalIds.add(id)
        }

        if (combinedTraditionalIds.size > tierLimits.traditionalMarkets) {
          // Owner 2026-09-18 (OB-026 #1, TR-069): the limit is VENDOR-WIDE —
          // distinct traditional markets across every other listing plus
          // market-box pickup markets — so "remove this listing from another
          // market" could never clear it. Name the markets that are counted,
          // and the plan by its real name (legacy tier names normalize to free).
          crumb.supabase('select', 'markets', { check: 'counted names' })
          const { data: countedMarkets, error: countedError } = await supabase
            .from('markets')
            .select('name')
            .in('id', existingUsage.marketIds)
            .order('name')
          if (countedError) {
            throw traced.fromSupabase(countedError, { table: 'markets', operation: 'select' })
          }
          const countedNames = (countedMarkets || []).map((m) => m.name as string)
          const planName = normalizeTier(tier)
          const alreadyAt = countedNames.length > 0
            ? ` You already have active listings (or a market box) at: ${countedNames.join(', ')}.`
            : ''
          return NextResponse.json(
            {
              error: `Your ${planName} plan allows active listings at up to ${tierLimits.traditionalMarkets} traditional markets, counted across all your listings and market-box pickup markets.${alreadyAt} Remove a market from those listings first, or upgrade your plan.`,
              code: 'ERR_MARKET_LIMIT',
              currentCount: existingUsage.count,
              proposedCount: combinedTraditionalIds.size,
              limit: tierLimits.traditionalMarkets,
              tier,
            },
            { status: 400 }
          )
        }
      }

      crumb.supabase('delete', 'listing_markets')
      const { error: deleteError } = await supabase
        .from('listing_markets')
        .delete()
        .eq('listing_id', listingId)

      if (deleteError) {
        throw traced.fromSupabase(deleteError, {
          table: 'listing_markets',
          operation: 'delete',
        })
      }

      if (uniqueMarketIds.length > 0) {
        crumb.supabase('insert', 'listing_markets')
        const rows = uniqueMarketIds.map((marketId) => ({
          listing_id: listingId,
          market_id: marketId,
        }))

        const { error: insertError } = await supabase
          .from('listing_markets')
          .insert(rows)

        if (insertError) {
          throw traced.fromSupabase(insertError, {
            table: 'listing_markets',
            operation: 'insert',
          })
        }
      }

      // Owner ruling Q3 (2026-09-24): "taxable items wait for codes + admin
      // gets notified that someone is waiting". The attach above succeeded;
      // if this listing is taxable and any chosen location is not tax-ready
      // (lib/tax/readiness.ts — the engine would refuse a taxable sale there),
      // tell the admins who can enter the codes. Once per market per 24 h
      // (H-6 dedupe pattern: notifications.data.dedupRef = market id).
      // Additive + non-throwing: a notification problem never fails the save
      // the vendor just made — it is logged instead.
      if (listing.is_taxable && chosenMarkets.length > 0) {
        try {
          const waiting = chosenMarkets.filter(
            (m) => uniqueMarketIds.includes(m.id as string) && marketTaxReadiness(m) !== 'ready'
          )
          if (waiting.length > 0) {
            const serviceClient = createServiceClient()
            const admins = await adminRecipientsForVertical(serviceClient, listing.vertical_id as string)
            const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            for (const m of waiting) {
              const { data: recent } = await observed(serviceClient
                .from('notifications')
                .select('id')
                .eq('type', 'tax_codes_needed_admin')
                .contains('data', { dedupRef: m.id })
                .gte('created_at', cutoff)
                .limit(1), { table: 'notifications' })
              if (recent && recent.length > 0) continue
              for (const adminId of admins) {
                await sendNotification(adminId, 'tax_codes_needed_admin', {
                  marketName: (m.name as string) || 'a market',
                  marketId: m.id as string,
                  itemTitle: (listing.title as string) || '',
                  vertical: listing.vertical_id as string,
                  dedupRef: m.id as string,
                }, { vertical: listing.vertical_id as string })
              }
            }
          }
        } catch (notifyErr) {
          await logError(new TracedError('ERR_LISTING_001', `tax_codes_needed_admin fan-out failed for listing ${listingId}: ${notifyErr instanceof Error ? notifyErr.message : String(notifyErr)}`, {
            route: '/api/vendor/listings/[listingId]/markets', method: 'POST',
          }))
        }
      }

      return NextResponse.json({
        success: true,
        marketIds: uniqueMarketIds,
      })
    }
  )
}
