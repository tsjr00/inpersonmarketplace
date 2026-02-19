import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyAdminForApi } from '@/lib/auth/admin'
import { withErrorTracing, traced } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimits, rateLimitResponse } from '@/lib/rate-limit'

/**
 * GET /api/admin/knowledge
 * List all knowledge articles (admin sees published + unpublished)
 */
export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
  if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

  return withErrorTracing('/api/admin/knowledge', 'GET', async () => {
    const { isAdmin } = await verifyAdminForApi()
    if (!isAdmin) {
      throw traced.auth('ERR_AUTH_020', 'Admin access required')
    }

    const serviceClient = createServiceClient()
    const { data: articles, error } = await serviceClient
      .from('knowledge_articles')
      .select('*')
      .order('category')
      .order('sort_order')

    if (error) {
      throw traced.fromSupabase(error, { table: 'knowledge_articles', operation: 'select' })
    }

    return NextResponse.json({ articles: articles || [] })
  })
}

/**
 * POST /api/admin/knowledge
 * Create a new knowledge article
 */
export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
  if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

  return withErrorTracing('/api/admin/knowledge', 'POST', async () => {
    const { isAdmin } = await verifyAdminForApi()
    if (!isAdmin) {
      throw traced.auth('ERR_AUTH_020', 'Admin access required')
    }

    const body = await request.json()
    const { title, category, body: articleBody, sort_order, is_published, vertical_id } = body

    if (!title || !category || !articleBody) {
      throw traced.validation('ERR_KB_001', 'Title, category, and body are required')
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
        vertical_id: vertical_id || null,
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
 * Update an existing knowledge article
 */
export async function PATCH(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
  if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

  return withErrorTracing('/api/admin/knowledge', 'PATCH', async () => {
    const { isAdmin } = await verifyAdminForApi()
    if (!isAdmin) {
      throw traced.auth('ERR_AUTH_020', 'Admin access required')
    }

    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      throw traced.validation('ERR_KB_002', 'Article ID is required')
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

    const serviceClient = createServiceClient()
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
 * Delete a knowledge article
 */
export async function DELETE(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimitResult = checkRateLimit(`admin:${clientIp}`, rateLimits.admin)
  if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

  return withErrorTracing('/api/admin/knowledge', 'DELETE', async () => {
    const { isAdmin } = await verifyAdminForApi()
    if (!isAdmin) {
      throw traced.auth('ERR_AUTH_020', 'Admin access required')
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      throw traced.validation('ERR_KB_003', 'Article ID is required')
    }

    const serviceClient = createServiceClient()
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
