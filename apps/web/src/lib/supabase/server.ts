import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  )
}

// Service role client that bypasses RLS - use only for admin operations
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

/**
 * Create a service client ONLY after verifying the current user is an admin.
 * Use this in API routes that need service-role access for admin operations.
 *
 * Returns the service client + userId, or throws if not authorized.
 *
 * Usage:
 * ```typescript
 * const { serviceClient, userId } = await createVerifiedServiceClient()
 * ```
 */
export async function createVerifiedServiceClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin' ||
    profile?.role === 'platform_admin' ||
    (profile?.roles as string[] | null)?.includes('admin') ||
    (profile?.roles as string[] | null)?.includes('platform_admin') ||
    false

  if (!isAdmin) {
    throw new Error('Forbidden: admin role required')
  }

  return {
    serviceClient: createServiceClient(),
    userId: user.id,
  }
}
