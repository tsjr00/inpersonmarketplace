import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { getBoothMapUrl } from '@/lib/markets/booth-map'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * Booth/spot map for a market (mig 205). The manager uploads a map showing where
 * booths (FM) / truck spots (FT) are located; vendors see it during the
 * booth-rental flow and on their bookings.
 *
 * GET    — return { booth_map_url } (manager view; tolerant pre-migration).
 * POST   — upload an image OR PDF. Multipart form, `image` field. Writes the
 *          public URL to markets.booth_map_url.
 * DELETE — clear markets.booth_map_url (storage file left behind, cheap).
 *
 * Auth: caller must be the assigned manager of the market (same as the logo
 * route). Storage: `vendor-images` bucket, `booth-maps/` prefix.
 *
 * File constraints: JPG/PNG/GIF/WebP or PDF, 3 MB. Image moderation runs for
 * images only — a PDF can't be image-moderated and the manager is a trusted
 * operator uploading their own layout.
 */

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const PDF_TYPE = 'application/pdf'

async function authorize(
  marketId: string,
  request: NextRequest
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`mm-booth-map:${clientIp}`, rateLimits.submit)
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
  return { ok: true }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/booth-map', 'GET', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()
    const booth_map_url = await getBoothMapUrl(serviceClient, marketId)
    return NextResponse.json({ booth_map_url })
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/booth-map', 'POST', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const formData = await request.formData()
    const file = formData.get('image') as File | null

    if (!file) {
      throw traced.validation('ERR_VALIDATION_001', 'image field is required')
    }

    const isPdf = file.type === PDF_TYPE
    if (!IMAGE_TYPES.includes(file.type) && !isPdf) {
      throw traced.validation('ERR_VALIDATION_002', 'File must be a JPG, PNG, GIF, WebP image or a PDF')
    }
    if (file.size > 3 * 1024 * 1024) {
      throw traced.validation('ERR_VALIDATION_003', 'File must be under 3MB')
    }

    const fileExt = isPdf ? 'pdf' : (file.name.split('.').pop() || 'jpg')
    const fileName = `${marketId}-booth-map-${Date.now()}.${fileExt}`
    const filePath = `booth-maps/${fileName}`

    // Storage writes go through the service client (manager auth already verified).
    const serviceClient = createServiceClient()

    crumb.supabase('insert', 'storage:vendor-images')
    const { error: uploadError } = await serviceClient.storage
      .from('vendor-images')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      throw traced.fromSupabase(uploadError, {
        table: 'storage:vendor-images',
        operation: 'insert',
      })
    }

    const { data: { publicUrl } } = serviceClient.storage
      .from('vendor-images')
      .getPublicUrl(filePath)

    // Image moderation for images only — a PDF can't be image-moderated.
    if (!isPdf) {
      const { moderateStorageImage } = await import('@/lib/image-moderation')
      const modResult = await moderateStorageImage(publicUrl)
      if (!modResult.passed) {
        await serviceClient.storage.from('vendor-images').remove([filePath])
        throw traced.validation('ERR_VALIDATION_004', modResult.reason || 'Image failed moderation')
      }
    }

    crumb.supabase('update', 'markets')
    const { error: updateErr } = await serviceClient
      .from('markets')
      .update({ booth_map_url: publicUrl })
      .eq('id', marketId)

    if (updateErr) {
      throw traced.fromSupabase(updateErr, {
        table: 'markets',
        operation: 'update',
      })
    }

    return NextResponse.json({ success: true, booth_map_url: publicUrl })
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/booth-map', 'DELETE', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()
    crumb.supabase('update', 'markets')
    const { error: updateErr } = await serviceClient
      .from('markets')
      .update({ booth_map_url: null })
      .eq('id', marketId)

    if (updateErr) {
      throw traced.fromSupabase(updateErr, {
        table: 'markets',
        operation: 'update',
      })
    }

    return NextResponse.json({ success: true })
  })
}
