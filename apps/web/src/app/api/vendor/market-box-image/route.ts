import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/vendor/market-box-image
 * Upload a market box image
 * Returns the public URL for storage in image_urls column
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a vendor
    const { data: vendor } = await supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!vendor) {
      return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 })
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('image') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type (should be pre-processed to JPEG/WebP by client)
    if (!['image/jpeg', 'image/webp'].includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG and WebP are accepted.' },
        { status: 400 }
      )
    }

    // Size limit: 1MB (images should be ~100-300KB after client resize)
    if (file.size > 1024 * 1024) {
      return NextResponse.json(
        { error: 'File must be under 1MB' },
        { status: 400 }
      )
    }

    // Generate unique path
    const imageId = crypto.randomUUID()
    const fileExt = file.type === 'image/webp' ? 'webp' : 'jpg'
    const filePath = `market-boxes/${vendor.id}/${imageId}.${fileExt}`

    // Upload to Supabase Storage (reuse listing-images bucket)
    const { error: uploadError } = await supabase.storage
      .from('listing-images')
      .upload(filePath, file, {
        contentType: file.type,
        cacheControl: '31536000' // 1 year cache
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('listing-images')
      .getPublicUrl(filePath)

    return NextResponse.json({
      success: true,
      imageUrl: publicUrl
    })
  } catch (error) {
    console.error('Market box image upload error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
