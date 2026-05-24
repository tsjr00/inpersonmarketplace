import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import {
  DOCUMENT_TYPES,
  isAllowedMime,
  MAX_DOCUMENT_BYTES,
  type MarketDocumentRow,
  type MarketDocumentType,
} from '@/lib/markets/document-types'

/**
 * GET  /api/market-manager/[marketId]/documents
 *   Returns the uploaded verification documents for this market.
 *   Auth: assigned manager of the market. (Admin uses a separate
 *   /api/admin/markets/[id]/documents endpoint in Commit 4 so admin
 *   reviews don't share rate-limit + auth gate with manager edits.)
 *
 * POST /api/market-manager/[marketId]/documents
 *   Multipart upload. Fields:
 *     - file:          required, PDF/JPG/PNG/WebP, ≤3MB
 *     - document_type: required, one of DOCUMENT_TYPES
 *     - notes:         optional free-text label (≤200 chars)
 *
 *   Auth: assigned manager.
 *
 *   Flow:
 *     1. Validate auth + multipart fields
 *     2. Upload to market-documents bucket at <market_id>/<uuid>-<name>
 *     3. Insert market_documents row
 *     4. Return the row (NOT a signed URL — viewer fetches separately)
 *
 *   On insert failure: remove the orphan storage object so we don't
 *   accumulate unreferenced files.
 */

async function authorize(
  marketId: string,
  request: NextRequest
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`mm-docs:${clientIp}`, rateLimits.submit)
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
  return { ok: true, userId: user.id }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/documents', 'GET', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()
    crumb.supabase('select', 'market_documents')
    const { data, error } = await serviceClient
      .from('market_documents')
      .select('*')
      .eq('market_id', marketId)
      .order('uploaded_at', { ascending: false })

    if (error) {
      throw traced.fromSupabase(error, { table: 'market_documents', operation: 'select' })
    }

    return NextResponse.json({ documents: (data || []) as MarketDocumentRow[] })
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/documents', 'POST', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    // Multipart parse
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const documentType = formData.get('document_type')
    const notesRaw = formData.get('notes')

    if (!file) {
      throw traced.validation('ERR_VALIDATION_001', 'file field is required')
    }

    if (typeof documentType !== 'string' || !(DOCUMENT_TYPES as readonly string[]).includes(documentType)) {
      throw traced.validation(
        'ERR_VALIDATION_002',
        `document_type is required and must be one of: ${DOCUMENT_TYPES.join(', ')}`
      )
    }

    if (!isAllowedMime(file.type)) {
      throw traced.validation(
        'ERR_VALIDATION_003',
        'File type not allowed — only PDF, JPG, PNG, and WebP are accepted.'
      )
    }

    if (file.size > MAX_DOCUMENT_BYTES) {
      const mb = (MAX_DOCUMENT_BYTES / (1024 * 1024)).toFixed(0)
      throw traced.validation(
        'ERR_VALIDATION_004',
        `File must be under ${mb}MB. Try compressing the PDF or splitting it across uploads.`
      )
    }

    const notes =
      typeof notesRaw === 'string' && notesRaw.trim().length > 0
        ? notesRaw.trim().slice(0, 200)
        : null

    // Storage path: <market_id>/<uuid>-<original-name>. The UUID prefix
    // disambiguates re-uploads of the same filename and protects against
    // path-traversal characters in the original name.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
    const storagePath = `${marketId}/${crypto.randomUUID()}-${safeName}`

    const serviceClient = createServiceClient()

    crumb.supabase('insert', 'storage:market-documents')
    const { error: uploadError } = await serviceClient.storage
      .from('market-documents')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      throw traced.fromSupabase(uploadError, {
        table: 'storage:market-documents',
        operation: 'insert',
      })
    }

    crumb.supabase('insert', 'market_documents')
    const { data: inserted, error: insertError } = await serviceClient
      .from('market_documents')
      .insert({
        market_id: marketId,
        uploader_user_id: auth.userId,
        document_type: documentType as MarketDocumentType,
        storage_path: storagePath,
        file_name: file.name.slice(0, 200),
        file_size_bytes: file.size,
        mime_type: file.type,
        notes,
      })
      .select('*')
      .single()

    if (insertError) {
      // Orphan cleanup — remove the just-uploaded object so we don't
      // accumulate untracked files in the bucket.
      await serviceClient.storage.from('market-documents').remove([storagePath])
      throw traced.fromSupabase(insertError, {
        table: 'market_documents',
        operation: 'insert',
      })
    }

    return NextResponse.json({ document: inserted as MarketDocumentRow }, { status: 201 })
  })
}
