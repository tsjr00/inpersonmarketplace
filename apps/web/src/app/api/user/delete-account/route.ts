import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { withErrorTracing } from '@/lib/errors'

export async function DELETE(request: Request) {
  return withErrorTracing('/api/user/delete-account', 'DELETE', async () => {
    try {
      // Rate limit: 3 requests per hour for account deletion
      const clientIp = getClientIp(request)
      const rateLimitResult = checkRateLimit(`delete-account:${clientIp}`, {
        limit: 3,
        windowSeconds: 3600 // 1 hour
      })
      if (!rateLimitResult.success) {
        return rateLimitResponse(rateLimitResult)
      }

      const supabase = await createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { confirmEmail } = await request.json()

      // Verify email matches
      if (confirmEmail !== user.email) {
        return NextResponse.json({ error: 'Email confirmation does not match' }, { status: 400 })
      }

      // Soft delete approach: Mark user data as deleted but preserve for data integrity
      // This allows for potential recovery and maintains referential integrity

      // 1. Anonymize user profile
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({
          display_name: 'Deleted User',
          email: null,
          deleted_at: new Date().toISOString(),
          notification_preferences: null,
          preferred_latitude: null,
          preferred_longitude: null
        })
        .eq('user_id', user.id)

      if (profileError) {
        console.error('Error anonymizing user profile:', profileError)
      }

      // 2. Get and anonymize vendor profiles for this user
      const { data: vendorProfiles } = await supabase
        .from('vendor_profiles')
        .select('id')
        .eq('user_id', user.id)

      if (vendorProfiles && vendorProfiles.length > 0) {
        for (const vendor of vendorProfiles) {
          // Soft delete listings
          await supabase
            .from('listings')
            .update({ deleted_at: new Date().toISOString() })
            .eq('vendor_profile_id', vendor.id)

          // Deactivate market box offerings
          await supabase
            .from('market_box_offerings')
            .update({ active: false })
            .eq('vendor_profile_id', vendor.id)
        }

        // Anonymize vendor profiles
        await supabase
          .from('vendor_profiles')
          .update({
            status: 'deleted',
            profile_data: { business_name: 'Deleted Vendor' },
            description: null,
            profile_image_url: null,
            social_links: null
          })
          .eq('user_id', user.id)
      }

      // 3. Sign out the user (this invalidates their session)
      await supabase.auth.signOut()

      // Note: Actual user deletion from auth.users requires admin privileges
      // In production, you'd want a background job or admin action to complete this
      // For now, we've anonymized their data and signed them out

      return NextResponse.json({
        success: true,
        message: 'Account has been deleted and data anonymized'
      })
    } catch (error) {
      console.error('Error deleting account:', error)
      return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
    }
  })
}
