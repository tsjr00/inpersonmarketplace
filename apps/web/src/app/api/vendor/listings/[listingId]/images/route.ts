import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const MAX_IMAGES_PER_LISTING = 5

/**
 * GET /api/vendor/listings/[listingId]/images
 * Get all images for a listing
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ listingId: string }> }
) {
  try {
    const { listingId } = await params
    const supabase = await createClient()

    const { data: images, error } = await supabase
      .from('listing_images')
      .select('*')
      .eq('listing_id', listingId)
      .order('display_order', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ images })
  } catch (error) {
    console.error('Get listing images error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/vendor/listings/[listingId]/images
 * Upload a new image for a listing
 * Expects FormData with 'image' file field
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listingId: string }> }
) {
  try {
    const { listingId } = await params
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user owns this listing through their vendor profile
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, vendor_profile_id, vendor_profiles!inner(user_id)')
      .eq('id', listingId)
      .single()

    if (listingError || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const vendorProfile = listing.vendor_profiles as unknown as { user_id: string }
    if (vendorProfile.user_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized to modify this listing' }, { status: 403 })
    }

    // Check current image count
    const { count } = await supabase
      .from('listing_images')
      .select('*', { count: 'exact', head: true })
      .eq('listing_id', listingId)

    if (count !== null && count >= MAX_IMAGES_PER_LISTING) {
      return NextResponse.json(
        { error: `Maximum ${MAX_IMAGES_PER_LISTING} images per listing` },
        { status: 400 }
      )
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

    // Generate unique image ID and path
    const imageId = crypto.randomUUID()
    const fileExt = file.type === 'image/webp' ? 'webp' : 'jpg'
    const filePath = `listings/${listingId}/${imageId}.${fileExt}`

    // Upload to Supabase Storage
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

    // Determine display order (add to end)
    const nextOrder = (count ?? 0)

    // Create listing_images record
    const { data: imageRecord, error: insertError } = await supabase
      .from('listing_images')
      .insert({
        id: imageId,
        listing_id: listingId,
        storage_path: filePath,
        url: publicUrl,
        display_order: nextOrder,
        is_primary: nextOrder === 0 // First image is primary
      })
      .select()
      .single()

    if (insertError) {
      // Clean up uploaded file if DB insert fails
      await supabase.storage.from('listing-images').remove([filePath])
      console.error('Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save image record' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      image: imageRecord
    })
  } catch (error) {
    console.error('Upload listing image error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/vendor/listings/[listingId]/images
 * Delete an image from a listing
 * Expects JSON body with { imageId: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ listingId: string }> }
) {
  try {
    const { listingId } = await params
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const { imageId } = await request.json()
    if (!imageId) {
      return NextResponse.json({ error: 'imageId is required' }, { status: 400 })
    }

    // Verify user owns this listing
    const { data: listing } = await supabase
      .from('listings')
      .select('id, vendor_profiles!inner(user_id)')
      .eq('id', listingId)
      .single()

    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const vendorProfile = listing.vendor_profiles as unknown as { user_id: string }
    if (vendorProfile.user_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Get image record
    const { data: image } = await supabase
      .from('listing_images')
      .select('*')
      .eq('id', imageId)
      .eq('listing_id', listingId)
      .single()

    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('listing-images')
      .remove([image.storage_path])

    if (storageError) {
      console.error('Storage delete error:', storageError)
      // Continue anyway - we still want to remove the DB record
    }

    // Delete DB record
    const { error: deleteError } = await supabase
      .from('listing_images')
      .delete()
      .eq('id', imageId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // If this was the primary image, make the first remaining image primary
    if (image.is_primary) {
      const { data: remainingImages } = await supabase
        .from('listing_images')
        .select('id')
        .eq('listing_id', listingId)
        .order('display_order', { ascending: true })
        .limit(1)

      if (remainingImages && remainingImages.length > 0) {
        await supabase
          .from('listing_images')
          .update({ is_primary: true })
          .eq('id', remainingImages[0].id)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete listing image error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/vendor/listings/[listingId]/images
 * Update image properties (reorder, set primary)
 * Expects JSON body with { imageId: string, is_primary?: boolean, display_order?: number }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ listingId: string }> }
) {
  try {
    const { listingId } = await params
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const { imageId, is_primary, display_order } = await request.json()
    if (!imageId) {
      return NextResponse.json({ error: 'imageId is required' }, { status: 400 })
    }

    // Verify user owns this listing
    const { data: listing } = await supabase
      .from('listings')
      .select('id, vendor_profiles!inner(user_id)')
      .eq('id', listingId)
      .single()

    if (!listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const vendorProfile = listing.vendor_profiles as unknown as { user_id: string }
    if (vendorProfile.user_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    // Build update object
    const updates: Record<string, unknown> = {}
    if (typeof display_order === 'number') {
      updates.display_order = display_order
    }

    // If setting as primary, first unset all other images
    if (is_primary === true) {
      await supabase
        .from('listing_images')
        .update({ is_primary: false })
        .eq('listing_id', listingId)
      updates.is_primary = true
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    // Update the image
    const { data: updatedImage, error: updateError } = await supabase
      .from('listing_images')
      .update(updates)
      .eq('id', imageId)
      .eq('listing_id', listingId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      image: updatedImage
    })
  } catch (error) {
    console.error('Update listing image error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
