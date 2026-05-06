'use client'

import { createClient } from '@/lib/supabase/client'
import { VerticalBranding } from '@/lib/branding'

interface LogoutButtonProps {
  vertical: string
  branding: VerticalBranding
}

export default function LogoutButton({ vertical, branding }: LogoutButtonProps) {
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    // Full page reload (not router.push) — clears all client-side React state
    // including useCart's items array. Without this, the next user logging in
    // in the same tab sees the prior user's cart until they hard-refresh.
    // Session 78 bug: cart staleness across user switch in the same tab.
    window.location.href = `/${vertical}/login`
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        padding: '10px 20px',
        backgroundColor: '#f44',
        color: 'white',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        fontWeight: 600
      }}
    >
      Logout
    </button>
  )
}
