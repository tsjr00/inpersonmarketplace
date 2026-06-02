import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { hasAdminRole } from '@/lib/auth/admin'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * GET /api/vendor-documents/signed-url?path=<storage-path>&marketId=<optional>
 *
 * Mints a short-lived signed URL for a vendor-documents bucket file. Replaces
 * direct public-URL access now that the bucket is private (mig 151 / X3).
 *
 * Auth (any one of the following grants access):
 *   1. Vendor owns the doc — caller's vendor_profile.id matches the vp_id
 *      parsed from the storage path.
 *   2. Platform admin or vertical admin for the doc's vendor's vertical.
 *   3. Market manager — caller is the assigned manager of the supplied
 *      marketId AND the doc's vendor has authorized info-sharing for that
 *      market (synthetic _info_sharing_consent in statements_snapshot).
 *      `marketId` query param is REQUIRED for this path.
 *
 * Path validation: must match `<prefix>/<vp-uuid>/...` where prefix is one
 * of: coi, business-docs, category-docs, permit-docs, certifications.
 * Rejects malformed paths to prevent traversal / cross-bucket sniffing.
 *
 * Signed URL TTL: 1 hour. Frontend re-mints on next page load / click.
 *
 * Response:
 *   200 → { signed_url, expires_in_seconds }
 *   400 → invalid path format
 *   401 → not authenticated
 *   403 → not authorized to view this document
 *   404 → vendor profile (from path) not found
 */

const KNOWN_PREFIXES = ['coi', 'business-docs', 'category-docs', 'permit-docs', 'certifications'] as const
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour

interface ParsedPath {
  prefix: string
  vendorProfileId: string
}

function parseStoragePath(path: string): ParsedPath | null {
  // Path shape: <prefix>/<vp-uuid>/<rest>
  // Reject leading slashes, '..' traversal, empty segments.
  if (!path || path.includes('..') || path.startsWith('/')) return null
  const parts = path.split('/')
  if (parts.length < 2) return null
  const [prefix, vendorProfileId] = parts
  if (!(KNOWN_PREFIXES as readonly string[]).includes(prefix)) return null
  if (!UUID_REGEX.test(vendorProfileId)) return null
  return { prefix, vendorProfileId }
}

async function callerOwnsDoc(
  supabase: SupabaseClient,
  userId: string,
  vendorProfileId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('vendor_profiles')
    .select('id')
    .eq('user_id', userId)
    .eq('id', vendorProfileId)
    .maybeSingle()
  return !!data
}

async function callerIsAdminForVendor(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  userId: string,
  vendorProfileId: string
): Promise<boolean> {
  // Get caller's user_profile + vendor's vertical_id in parallel
  const [profileRes, vendorRes] = await Promise.all([
    supabase.from('user_profiles').select('role, roles').eq('user_id', userId).is('deleted_at', null).maybeSingle(),
    serviceClient.from('vendor_profiles').select('vertical_id').eq('id', vendorProfileId).maybeSingle(),
  ])

  if (hasAdminRole((profileRes.data as { role?: string; roles?: string[] } | null) || {})) return true

  const verticalId = (vendorRes.data as { vertical_id?: string } | null)?.vertical_id
  if (!verticalId) return false

  const { data: verticalAdmin } = await supabase
    .from('vertical_admins')
    .select('id')
    .eq('user_id', userId)
    .eq('vertical_id', verticalId)
    .maybeSingle()
  return !!verticalAdmin
}

async function managerHasConsentedAccess(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  userId: string,
  marketId: string,
  vendorProfileId: string
): Promise<boolean> {
  // Caller must be the manager of this market
  const caller = { id: userId, email: '' } // isMarketManager handles email lookup itself
  // isMarketManager needs the user object with email — load it
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== userId) return false

  const allowed = await isMarketManager(supabase, marketId, user)
  if (!allowed) return false
  void caller // suppress unused-var warning

  // Vendor must have consented to info-sharing at this market
  const { data: acceptances } = await serviceClient
    .from('vendor_market_agreement_acceptances')
    .select('statements_snapshot')
    .eq('vendor_profile_id', vendorProfileId)
    .eq('market_id', marketId)

  return (acceptances || []).some((row) => {
    const snap = row.statements_snapshot as Array<{ statement_id?: string }> | null
    return Array.isArray(snap) && snap.some((s) => s?.statement_id === '_info_sharing_consent')
  })
}

export async function GET(request: NextRequest) {
  return withErrorTracing('/api/vendor-documents/signed-url', 'GET', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-doc-signed:${clientIp}`, rateLimits.api)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const path = request.nextUrl.searchParams.get('path') || ''
    const marketId = request.nextUrl.searchParams.get('marketId') || null

    const parsed = parseStoragePath(path)
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid document path' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    crumb.auth('Checking vendor-documents signed-url auth')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      throw traced.auth('ERR_AUTH_001', 'Not authenticated')
    }

    const serviceClient = createServiceClient()

    // Auth: ownership → admin → manager+consent. First match wins.
    const ownsDoc = await callerOwnsDoc(supabase, user.id, parsed.vendorProfileId)
    let authorized = ownsDoc
    if (!authorized) {
      authorized = await callerIsAdminForVendor(
        supabase,
        serviceClient,
        user.id,
        parsed.vendorProfileId
      )
    }
    if (!authorized && marketId) {
      authorized = await managerHasConsentedAccess(
        supabase,
        serviceClient,
        user.id,
        marketId,
        parsed.vendorProfileId
      )
    }
    if (!authorized) {
      return NextResponse.json(
        { error: 'Not authorized to view this document' },
        { status: 403 }
      )
    }

    crumb.supabase('select', 'storage:vendor-documents')
    const { data, error } = await serviceClient.storage
      .from('vendor-documents')
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

    if (error || !data?.signedUrl) {
      throw traced.fromSupabase(
        error || new Error('Failed to mint signed URL'),
        { table: 'storage:vendor-documents', operation: 'select' }
      )
    }

    return NextResponse.json({
      signed_url: data.signedUrl,
      expires_in_seconds: SIGNED_URL_TTL_SECONDS,
    })
  })
}
