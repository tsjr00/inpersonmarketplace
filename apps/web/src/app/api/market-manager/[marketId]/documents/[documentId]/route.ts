import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * GET    /api/market-manager/[marketId]/documents/[documentId]
 *   Generates a short-lived signed URL for viewing/downloading this
 *   document. Both manager + admin viewers fetch from here.
 *   TTL: 1 hour.
 *
 * DELETE /api/market-manager/[marketId]/documents/[documentId]
 *   Removes the file from storage + the row from market_documents.
 *   Manager-only (admin shouldn't quietly delete a manager's evidence;
 *   if a fraudulent doc is uploaded, the admin should escalate via
 *   off-platform comms or reject the market, not silently destroy).
 *
 * Both endpoints verify the documentId belongs to the marketId in the URL
 * (defense against cross-market id spoofing).
 */

async function authorize(
  marketId: string,
  documentId: string,
  request: NextRequest
): Promise<
  | { ok: true; userId: string; row: { id: string; storage_path: string } }
  | { ok: false; response: Response }
> {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`mm-docs:${clientIp}`, rateLimits.api)
  if (!rateLimitResult.success) {
    return { ok: false, response: rateLimitResponse(rateLimitResult) }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw traced.auth('ERR_AUTH_001', 'Not authenticated')

  const allowed = await isMarketManager(supabase, marketId, user)
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Not the manager of this market' }, { status: 403 }),
    }
  }

  // Verify doc belongs to this market (anti-spoof)
  const serviceClient = createServiceClient()
  crumb.supabase('select', 'market_documents')
  const { data: row, error } = await serviceClient
    .from('market_documents')
    .select('id, market_id, storage_path')
    .eq('id', documentId)
    .maybeSingle()

  if (error) {
    throw traced.fromSupabase(error, { table: 'market_documents', operation: 'select' })
  }
  if (!row) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Document not found' }, { status: 404 }),
    }
  }
  if (row.market_id !== marketId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Document not in this market' }, { status: 404 }),
    }
  }

  return {
    ok: true,
    userId: user.id,
    row: { id: row.id as string, storage_path: row.storage_path as string },
  }
}

const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string; documentId: string }> }
) {
  return withErrorTracing(
    '/api/market-manager/[marketId]/documents/[documentId]',
    'GET',
    async () => {
      const { marketId, documentId } = await params
      const auth = await authorize(marketId, documentId, request)
      if (!auth.ok) return auth.response

      const serviceClient = createServiceClient()
      crumb.supabase('select', 'storage:market-documents')
      const { data, error } = await serviceClient.storage
        .from('market-documents')
        .createSignedUrl(auth.row.storage_path, SIGNED_URL_TTL_SECONDS)

      if (error || !data?.signedUrl) {
        throw traced.fromSupabase(error || new Error('Failed to generate signed URL'), {
          table: 'storage:market-documents',
          operation: 'select',
        })
      }

      return NextResponse.json({
        signed_url: data.signedUrl,
        expires_in_seconds: SIGNED_URL_TTL_SECONDS,
      })
    }
  )
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string; documentId: string }> }
) {
  return withErrorTracing(
    '/api/market-manager/[marketId]/documents/[documentId]',
    'DELETE',
    async () => {
      const { marketId, documentId } = await params
      const auth = await authorize(marketId, documentId, request)
      if (!auth.ok) return auth.response

      const serviceClient = createServiceClient()

      // Storage delete first — if it fails, we want the DB row to still
      // reflect the file's existence (admin can re-try). The opposite
      // ordering (delete row first) creates an orphan file on storage
      // failure that's hard to discover.
      crumb.supabase('delete', 'storage:market-documents')
      const { error: storageErr } = await serviceClient.storage
        .from('market-documents')
        .remove([auth.row.storage_path])

      if (storageErr) {
        throw traced.fromSupabase(storageErr, {
          table: 'storage:market-documents',
          operation: 'delete',
        })
      }

      crumb.supabase('delete', 'market_documents')
      const { error: dbErr } = await serviceClient
        .from('market_documents')
        .delete()
        .eq('id', documentId)

      if (dbErr) {
        throw traced.fromSupabase(dbErr, {
          table: 'market_documents',
          operation: 'delete',
        })
      }

      return NextResponse.json({ success: true })
    }
  )
}
