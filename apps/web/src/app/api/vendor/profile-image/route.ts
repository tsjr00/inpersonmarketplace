import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { withErrorTracing } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/vendor/profile-image', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = checkRateLimit(`vendor-profile-image:${clientIp}`, rateLimits.submit)
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    try {
      const supabase = await createClient()

      // Get authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Get vendor profile
      const { data: vendor } = await supabase
        .from('vendor_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!vendor) {
        return NextResponse.json({ error: 'No vendor profile found' }, { status: 404 })
      }

      // Parse form data
      const formData = await request.formData()
      const file = formData.get('image') as File

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      }

      // Validate file
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ error: 'File must be an image' }, { status: 400 })
      }

      // Size limit: 2MB
      if (file.size > 2 * 1024 * 1024) {
        return NextResponse.json({ error: 'File must be under 2MB. Use squoosh.app to compress larger images.' }, { status: 400 })
      }

      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop()
      const fileName = `${vendor.id}-${Date.now()}.${fileExt}`
      const filePath = `vendor-profiles/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('vendor-images')
        .upload(filePath, file, {
          contentType: file.type,
          upsert: true
        })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('vendor-images')
        .getPublicUrl(filePath)

      // Update vendor profile
      const { error: updateError } = await supabase
        .from('vendor_profiles')
        .update({
          profile_image_url: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', vendor.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        imageUrl: publicUrl
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error('Profile image upload error:', message)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  })
}
