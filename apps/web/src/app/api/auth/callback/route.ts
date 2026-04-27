/**
 * Auth Callback Route
 *
 * Handles the code exchange for Supabase PKCE auth flow.
 * Email verification links (password reset, signup confirmation) redirect
 * through Supabase's /auth/v1/verify which then redirects here with ?code=.
 *
 * This server-side route exchanges the code for a session using the server
 * Supabase client (cookie-based, no code_verifier needed), then redirects
 * the user to their final destination.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const explicitNext = searchParams.get('next')

  if (!code) {
    // No code — redirect to home
    return NextResponse.redirect(new URL('/', origin))
  }

  // Default redirect target. We may override after we know who the user is
  // (so the FT vendor doesn't land on /farmers_market when `next` is missing).
  let next = explicitNext || '/'
  const response = NextResponse.redirect(new URL(next, origin))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // Code exchange failed — redirect to forgot-password with error indicator
    // Extract vertical from the next param (e.g., /food_trucks/reset-password → food_trucks)
    // Falls back to food_trucks (the most common signup vertical) when next is missing.
    const segments = (explicitNext || '').split('/').filter(Boolean)
    const vertical = segments[0] || 'food_trucks'
    return NextResponse.redirect(
      new URL(`/${vertical}/forgot-password?error=expired`, origin)
    )
  }

  // If caller didn't specify `next`, look up the user's vertical so we send
  // an FT vendor to /food_trucks/dashboard (not /farmers_market/dashboard).
  if (!explicitNext) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: vp } = await supabase
        .from('vendor_profiles')
        .select('vertical_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()
      if (vp?.vertical_id) {
        next = `/${vp.vertical_id}/dashboard`
        return NextResponse.redirect(new URL(next, origin), { headers: response.headers })
      }
    }
    // No vendor profile — leave at '/' (homepage with vertical chooser)
  }

  return response
}
