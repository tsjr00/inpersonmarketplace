import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAdminRole, hasPlatformAdminRole } from '@/lib/auth/admin'
import { withErrorTracing, traced } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * S4-2 knowledge scoping (owner decision 2026-07-22):
 *   - Platform admins manage platform-shared (vertical_id = null) AND every vertical's articles.
 *   - Vertical admins manage ONLY articles in a vertical they administer — they may NOT
 *     create/edit/delete platform-shared (null) articles or another vertical's articles.
 * knowledge_articles.vertical_id is NULLABLE, which is why this can't use verifyAdminScope
 * (that maps a null request to the admin's single vertical — wrong here, where null means
 * "platform-shared").
 */
type KnowledgeScope =
  | { ok: false; status: number; error: string }
  | { ok: true; isPlatform: boolean; verticals: Set<string> }

async function resolveKnowledgeScope(): Promise<KnowledgeScope> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!profile || !hasAdminRole(profile)) return { ok: false, status: 403, error: 'Admin access required' }
  if (hasPlatformAdminRole(profile)) return { ok: true, isPlatform: true, verticals: new Set() }

  const { data: vas } = await supabase
    .from('vertical_admins')
    .select('vertical_id')
    .eq('user_id', user.id)
  return { ok: true, isPlatform: false, verticals: new Set((vas || []).map(v => v.vertical_id as string)) }
}

/** True when this admin may MANAGE an article whose vertical is `articleVertical`. */
function canManage(scope: { isPlatform: boolean; verticals: Set<string> }, articleVertical: string | null): boolean {
  if (scope.isPlatform) return true
  // Vertical admin: only non-null verticals they administer (never platform-shared/null).
  return !!articleVertical && scope.verticals.has(articleVertical)
}

/**
 * GET /api/admin/knowledge
 * List knowledge articles (admin sees published + unpublished).
 * Platform admin: all. Vertical admin: only their own vertical(s)' articles.
 */
export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
  if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

  return withErrorTracing('/api/admin/knowledge', 'GET', async () => {
    const scope = await resolveKnowledgeScope()
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status })

    const serviceClient = createServiceClient()
    let query = serviceClient
      .from('knowledge_articles')
      .select('*')
      .order('category')
      .order('sort_order')

    // Vertical admins see only the articles they can manage (their vertical(s)).
    if (!scope.isPlatform) {
      query = query.in('vertical_id', Array.from(scope.verticals))
    }

    const { data: articles, error } = await query
    if (error) {
      throw traced.fromSupabase(error, { table: 'knowledge_articles', operation: 'select' })
    }

    return NextResponse.json({ articles: articles || [] })
  })
}

/**
 * POST /api/admin/knowledge
 * Create a new knowledge article.
 */
export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
  if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

  return withErrorTracing('/api/admin/knowledge', 'POST', async () => {
    const scope = await resolveKnowledgeScope()
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status })

    const body = await request.json()
    const { title, category, body: articleBody, sort_order, is_published, vertical_id } = body

    if (!title || !category || !articleBody) {
      throw traced.validation('ERR_KB_001', 'Title, category, and body are required')
    }

    const targetVertical = vertical_id || null
    if (!canManage(scope, targetVertical)) {
      return NextResponse.json(
        { error: 'You can only create articles for a vertical you administer (platform-shared articles are platform-admin only).' },
        { status: 403 }
      )
    }

    const serviceClient = createServiceClient()
    const { data: article, error } = await serviceClient
      .from('knowledge_articles')
      .insert({
        title,
        category,
        body: articleBody,
        sort_order: sort_order || 0,
        is_published: is_published || false,
        vertical_id: targetVertical,
      })
      .select()
      .single()

    if (error) {
      throw traced.fromSupabase(error, { table: 'knowledge_articles', operation: 'insert' })
    }

    return NextResponse.json({ article })
  })
}

/**
 * PATCH /api/admin/knowledge
 * Update an existing knowledge article.
 */
export async function PATCH(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
  if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

  return withErrorTracing('/api/admin/knowledge', 'PATCH', async () => {
    const scope = await resolveKnowledgeScope()
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status })

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      throw traced.validation('ERR_KB_002', 'Article ID is required')
    }

    const serviceClient = createServiceClient()

    // S4-2: a vertical admin may only edit an article in a vertical they manage —
    // and may not move it to platform-shared (null) or another vertical.
    const { data: existing } = await serviceClient
      .from('knowledge_articles')
      .select('vertical_id')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }
    if (!canManage(scope, (existing.vertical_id as string | null) ?? null)) {
      return NextResponse.json({ error: 'You can only edit articles in a vertical you administer.' }, { status: 403 })
    }
    if (updates.vertical_id !== undefined && !canManage(scope, updates.vertical_id || null)) {
      return NextResponse.json({ error: 'You cannot move an article to that vertical.' }, { status: 403 })
    }

    // Rename 'body' field to avoid collision with request body
    const dbUpdates: Record<string, unknown> = {}
    if (updates.title !== undefined) dbUpdates.title = updates.title
    if (updates.category !== undefined) dbUpdates.category = updates.category
    if (updates.body !== undefined) dbUpdates.body = updates.body
    if (updates.sort_order !== undefined) dbUpdates.sort_order = updates.sort_order
    if (updates.is_published !== undefined) dbUpdates.is_published = updates.is_published
    if (updates.vertical_id !== undefined) dbUpdates.vertical_id = updates.vertical_id || null
    dbUpdates.updated_at = new Date().toISOString()

    const { data: article, error } = await serviceClient
      .from('knowledge_articles')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw traced.fromSupabase(error, { table: 'knowledge_articles', operation: 'update' })
    }

    return NextResponse.json({ article })
  })
}

/**
 * DELETE /api/admin/knowledge?id=xxx
 * Delete a knowledge article.
 */
export async function DELETE(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimitResult = await checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
  if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

  return withErrorTracing('/api/admin/knowledge', 'DELETE', async () => {
    const scope = await resolveKnowledgeScope()
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: scope.status })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      throw traced.validation('ERR_KB_003', 'Article ID is required')
    }

    const serviceClient = createServiceClient()

    // S4-2: a vertical admin may only delete an article in a vertical they manage.
    const { data: existing } = await serviceClient
      .from('knowledge_articles')
      .select('vertical_id')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }
    if (!canManage(scope, (existing.vertical_id as string | null) ?? null)) {
      return NextResponse.json({ error: 'You can only delete articles in a vertical you administer.' }, { status: 403 })
    }

    const { error } = await serviceClient
      .from('knowledge_articles')
      .delete()
      .eq('id', id)

    if (error) {
      throw traced.fromSupabase(error, { table: 'knowledge_articles', operation: 'delete' })
    }

    return NextResponse.json({ success: true })
  })
}
