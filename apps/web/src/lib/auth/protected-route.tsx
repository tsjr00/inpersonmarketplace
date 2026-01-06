import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

interface ProtectedRouteProps {
  children: React.ReactNode
  redirectTo?: string
}

export async function ProtectedRoute({
  children,
  redirectTo = '/login'
}: ProtectedRouteProps) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect(redirectTo)
  }

  return <>{children}</>
}
