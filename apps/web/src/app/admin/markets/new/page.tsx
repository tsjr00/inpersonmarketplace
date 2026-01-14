import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import Link from 'next/link'
import MarketForm from '../MarketForm'

export default async function NewMarketPage() {
  await requireAdmin()
  const supabase = await createClient()

  // Get verticals for dropdown
  const { data: verticals } = await supabase
    .from('verticals')
    .select('vertical_id, name_public')
    .eq('is_active', true)
    .order('name_public')

  return (
    <div>
      <Link
        href="/admin/markets"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: '#0070f3',
          textDecoration: 'none',
          fontSize: 14,
          marginBottom: 20,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Markets
      </Link>

      <h1 style={{ color: '#333', marginBottom: 24 }}>Create New Market</h1>

      <MarketForm
        verticals={verticals || []}
        mode="create"
      />
    </div>
  )
}
