import { createClient, createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import AdminNav from '@/components/admin/AdminNav'
import KnowledgeEditor from './KnowledgeEditor'

export const revalidate = 0 // Always fresh for admin

interface AdminKnowledgePageProps {
  params: Promise<{ vertical: string }>
}

export default async function AdminKnowledgePage({ params }: AdminKnowledgePageProps) {
  const { vertical } = await params
  const supabase = await createClient()

  // Verify admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Please log in to access this page.</p>
      </div>
    )
  }

  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()

  const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')
  if (!isAdmin) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Admin access required.</p>
      </div>
    )
  }

  // Fetch all articles
  const serviceClient = createServiceClient()
  const { data: articles } = await serviceClient
    .from('knowledge_articles')
    .select('*')
    .order('category')
    .order('sort_order')

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px' }}>
      <AdminNav type="vertical" vertical={vertical} />

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
      }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 8, marginTop: 0, fontSize: 28 }}>
            Knowledge Base
          </h1>
          <p style={{ color: '#666', margin: 0, fontSize: 14 }}>
            Manage help articles and FAQ content visible to users
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link
            href={`/${vertical}/help`}
            target="_blank"
            style={{
              padding: '10px 20px',
              backgroundColor: '#0070f3',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 14
            }}
          >
            View Public Page
          </Link>
          <Link
            href={`/${vertical}/admin`}
            style={{
              padding: '10px 20px',
              backgroundColor: '#6c757d',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 6,
              fontWeight: 600,
              fontSize: 14
            }}
          >
            Back to Admin
          </Link>
        </div>
      </div>

      <KnowledgeEditor
        initialArticles={articles || []}
        vertical={vertical}
      />
    </div>
  )
}
