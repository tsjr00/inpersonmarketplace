import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/cover-image', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(`vendor-cover-image:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get vendor profile (with vertical filter if provided)
    const vertical = request.nextUrl.searchParams.get('vertical')
    let vpQuery = supabase.from('vendor_profiles').select('id').eq('user_id', user.id)
    if (vertical) vpQuery = vpQuery.eq('vertical_id', vertical)
    const { data: vendor } = await vpQuery.single()

    if (!vendor) {
      return NextResponse.json({ error: 'No vendor profile found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('image') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: 'File must be a JPG, PNG, GIF, or WebP image' }, { status: 400 })
    }

    // 3MB limit for cover photos (larger than profile images)
    if (file.size > 3 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 3MB' }, { status: 400 })
    }

    const fileExt = file.name.split('.').pop()
    const fileName = `${vendor.id}-cover-${Date.now()}.${fileExt}`
    const filePath = `vendor-profiles/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('vendor-images')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: true
      })

    if (uploadError) {
      console.error('Cover image upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage
      .from('vendor-images')
      .getPublicUrl(filePath)

    // Image content moderation
    const { moderateStorageImage } = await import('@/lib/image-moderation')
    const modResult = await moderateStorageImage(publicUrl)
    if (!modResult.passed) {
      await supabase.storage.from('vendor-images').remove([filePath])
      return NextResponse.json({ error: modResult.reason }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('vendor_profiles')
      .update({
        cover_image_url: publicUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', vendor.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, imageUrl: publicUrl })
  })
}
