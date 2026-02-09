import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { withErrorTracing } from '@/lib/errors'

export async function GET() {
  return withErrorTracing('/api/auth/me', 'GET', async () => {
    try {
      const supabase = await createClient()
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error || !user) {
        return NextResponse.json({ user: null }, { status: 200 })
      }

      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
        },
      })
    } catch (error) {
      console.error('Auth check error:', error)
      return NextResponse.json({ user: null }, { status: 200 })
    }
  })
}
