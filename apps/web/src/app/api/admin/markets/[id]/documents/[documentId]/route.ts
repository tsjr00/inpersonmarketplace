import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { hasAdminRole } from '@/lib/auth/admin'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/admin/markets/[id]/documents/[documentId]
 *
 * Generates a short-lived signed URL for an admin to view/download a
 * verification document. Mirror of the manager endpoint but with admin
 * auth (platform admin OR vertical admin for the market's vertical).
 *
 * TTL: 1 hour. No DELETE on admin side — manager owns the evidence.
 *
 * Cross-market id spoofing guard: documentId must belong to the marketId
 * in the URL path. Returns 404 on mismatch.
 */
async function verifyAdminAccess(
  supabase: SupabaseClient,
  userId: string,
  verticalId?: string
): Promise<boolean> {
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single()

  if (hasAdminRole(userProfile || {})) return true

  if (verticalId) {
    const { data: verticalAdmin } = await supabase
      .from('vertical_admins')
      .select('id')
      .eq('user_id', userId)
      .eq('vertical_id', verticalId)
      .single()
    return !!verticalAdmin
  }
  return false
}

const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  return withErrorTracing(
    '/api/admin/markets/[id]/documents/[documentId]',
    'GET',
    async () => {
      const clientIp = getClientIp(request)
      const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
      if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

      const { id: marketId, documentId } = await params
      const serviceClient = createServiceClient()

      crumb.supabase('select', 'markets')
      const { data: market, error: marketErr } = await serviceClient
        .from('markets')
        .select('id, vertical_id')
        .eq('id', marketId)
        .maybeSingle()

      if (marketErr) {
        throw traced.fromSupabase(marketErr, { table: 'markets', operation: 'select' })
      }
      if (!market) {
        return NextResponse.json({ error: 'Market not found' }, { status: 404 })
      }

      if (!(await verifyAdminAccess(supabase, user.id, market.vertical_id as string))) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
      }

      crumb.supabase('select', 'market_documents')
      const { data: doc, error: docErr } = await serviceClient
        .from('market_documents')
        .select('id, market_id, storage_path')
        .eq('id', documentId)
        .maybeSingle()

      if (docErr) {
        throw traced.fromSupabase(docErr, { table: 'market_documents', operation: 'select' })
      }
      if (!doc) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
      if (doc.market_id !== marketId) {
        // Cross-market spoof — same 404 to avoid leaking existence.
        return NextResponse.json({ error: 'Document not in this market' }, { status: 404 })
      }

      crumb.supabase('select', 'storage:market-documents')
      const { data: signed, error: signedErr } = await serviceClient.storage
        .from('market-documents')
        .createSignedUrl(doc.storage_path as string, SIGNED_URL_TTL_SECONDS)

      if (signedErr || !signed?.signedUrl) {
        throw traced.fromSupabase(
          signedErr || new Error('Failed to generate signed URL'),
          { table: 'storage:market-documents', operation: 'select' }
        )
      }

      return NextResponse.json({
        signed_url: signed.signedUrl,
        expires_in_seconds: SIGNED_URL_TTL_SECONDS,
      })
    }
  )
}
