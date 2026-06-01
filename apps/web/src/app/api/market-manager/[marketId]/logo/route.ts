import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isMarketManager } from '@/lib/markets/manager-auth'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import { withErrorTracing, traced, crumb } from '@/lib/errors'

/**
 * POST /api/market-manager/[marketId]/logo
 *   Upload a logo image for this market. Multipart form with `image` field.
 *   Writes the public URL to markets.logo_url (mig 140).
 *
 * DELETE /api/market-manager/[marketId]/logo
 *   Clear the market's logo_url. Storage file is left behind (cheap, and
 *   we may want to restore from a prior version later). Future cleanup
 *   job can sweep orphans.
 *
 * Auth: caller must be the assigned manager of the market. Mirrors the
 * other manager API routes — `createClient()` → `auth.getUser()` →
 * `isMarketManager()` → service client for the actual write.
 *
 * Storage: uses the `vendor-images` bucket (shared with vendor profile
 * images — same upload mechanics, just under a `market-logos/` prefix).
 *
 * File constraints: same as vendor cover-image — JPG/PNG/GIF/WebP, 3MB.
 */

async function authorize(
  marketId: string,
  request: NextRequest
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`mm-logo:${clientIp}`, rateLimits.submit)
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
  return withErrorTracing('/api/market-manager/[marketId]/logo', 'POST', async () => {
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
    const fileName = `${marketId}-logo-${Date.now()}.${fileExt}`
    const filePath = `market-logos/${fileName}`

    const supabase = await createClient()

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

    // Image moderation — same path as vendor cover image.
    const { moderateStorageImage } = await import('@/lib/image-moderation')
    const modResult = await moderateStorageImage(publicUrl)
    if (!modResult.passed) {
      await serviceClient.storage.from('vendor-images').remove([filePath])
      throw traced.validation('ERR_VALIDATION_004', modResult.reason || 'Image failed moderation')
    }

    // Write the URL to markets.logo_url (re-uses the same service client).
    crumb.supabase('update', 'markets')
    const { error: updateErr } = await serviceClient
      .from('markets')
      .update({ logo_url: publicUrl })
      .eq('id', marketId)

    if (updateErr) {
      throw traced.fromSupabase(updateErr, {
        table: 'markets',
        operation: 'update',
      })
    }

    return NextResponse.json({ success: true, logo_url: publicUrl })
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ marketId: string }> }
) {
  return withErrorTracing('/api/market-manager/[marketId]/logo', 'DELETE', async () => {
    const { marketId } = await params
    const auth = await authorize(marketId, request)
    if (!auth.ok) return auth.response

    const serviceClient = createServiceClient()
    crumb.supabase('update', 'markets')
    const { error: updateErr } = await serviceClient
      .from('markets')
      .update({ logo_url: null })
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
