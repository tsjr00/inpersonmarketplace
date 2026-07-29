import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * POST /api/market-manager/[marketId]/cover-image
 *   Upload a cover/hero photo for this market. Multipart form with `image` field.
 *   Writes the public URL to markets.cover_image_url (mig 212).
 *
 * DELETE /api/market-manager/[marketId]/cover-image
 *   Clear the market's cover_image_url. Storage file is left behind (cheap;
 *   an orphan-sweep job can reclaim it later), matching the logo route.
 *
 * A cover photo is DISTINCT from the logo (mig 140): the logo is the small
 * square brand mark; the cover is a landscape photo of the park/lot shown as a
 * banner on the public market profile (tester finding 2026-07-28). Mirrors the
 * logo route exactly — same auth, same bucket, same constraints + moderation.
 *
 * Storage: `vendor-images` bucket, `market-covers/` prefix.
 * File constraints: JPG/PNG/GIF/WebP, 3MB (same as the logo route).
 */

async function authorize(
  marketId: string,
  request: NextRequest
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`mm-cover:${clientIp}`, rateLimits.submit)
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/cover-image', 'POST', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const formData = await request.formData()
    const file = formData.get('image') as File | null

    if (!file) {
      throw traced.validation('ERR_VALIDATION_001', 'image field is required')
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!validTypes.includes(file.type)) {
      throw traced.validation('ERR_VALIDATION_002', 'File must be a JPG, PNG, GIF, or WebP image')
    }
    if (file.size > 3 * 1024 * 1024) {
      throw traced.validation('ERR_VALIDATION_003', 'File must be under 3MB')
    }

    const fileExt = file.name.split('.').pop() || 'jpg'
    const fileName = `${marketId}-cover-${Date.now()}.${fileExt}`
    const filePath = `market-covers/${fileName}`

    // Storage writes go through service client (X2 hardening, mig 150).
    // Manager auth already verified upstream via isMarketManager.
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

    // Image moderation — same path as the logo route.
    const { moderateStorageImage } = await import('@/lib/image-moderation')
    const modResult = await moderateStorageImage(publicUrl)
    if (!modResult.passed) {
      await serviceClient.storage.from('vendor-images').remove([filePath])
      throw traced.validation('ERR_VALIDATION_004', modResult.reason || 'Image failed moderation')
    }

    crumb.supabase('update', 'markets')
    const { error: updateErr } = await serviceClient
      .from('markets')
      .update({ cover_image_url: publicUrl })
      .eq('id', marketId)

    if (updateErr) {
      throw traced.fromSupabase(updateErr, {
        table: 'markets',
        operation: 'update',
      })
    }

    return NextResponse.json({ success: true, cover_image_url: publicUrl })
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/cover-image', 'DELETE', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()
    crumb.supabase('update', 'markets')
    const { error: updateErr } = await serviceClient
      .from('markets')
      .update({ cover_image_url: null })
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
