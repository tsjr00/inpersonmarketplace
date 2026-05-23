import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { withErrorTracing, traced, crumb } from '@/lib/errors'
import { checkRateLimit, getClientIp, rateLimitResponse, rateLimits } from '@/lib/rate-limit'
import {
  validateSurveySubmission,
  buildSubmissionUpdate,
  type SurveyKind,
  type MarketSurveyRow,
} from '@/lib/surveys/types'
import { isWellFormedSurveyToken } from '@/lib/surveys/token'

/**
 * POST /api/surveys/respond
 *
 * Single endpoint for both audiences (Phase E Stage 3 + 4):
 *
 *   Vendor path (requires auth):
 *     Body: { surveyId, rating_*, comment? }
 *     Caller must be signed in; their vendor_profile must own the row.
 *
 *   Buyer path (no auth — token in body):
 *     Body: { accessToken, rating_*, comment? }
 *     Token must match an unsubmitted, non-expired buyer survey row.
 *
 * Validation: validateSurveySubmission() in src/lib/surveys/types.ts
 * enforces per-kind required categories + the 1-5 range + comment
 * length cap. Rejected with 400 + field-specific message.
 *
 * Already-submitted / expired rows return 409 with a friendly message.
 */
export async function POST(request: NextRequest) {
  return withErrorTracing('/api/surveys/respond', 'POST', async () => {
    const clientIp = getClientIp(request)
    const rateLimitResult = await checkRateLimit(
      `surveys-respond:${clientIp}`,
      rateLimits.submit
    )
    if (!rateLimitResult.success) return rateLimitResponse(rateLimitResult)

    const body = await request.json().catch(() => ({}))
    const surveyId = typeof body?.surveyId === 'string' ? body.surveyId : null
    const accessToken = typeof body?.accessToken === 'string' ? body.accessToken : null

    if (!surveyId && !accessToken) {
      throw traced.validation(
        'ERR_VALIDATION_001',
        'Either surveyId (vendor) or accessToken (buyer) is required.'
      )
    }
    if (surveyId && accessToken) {
      throw traced.validation(
        'ERR_VALIDATION_002',
        'Provide either surveyId or accessToken, not both.'
      )
    }

    const serviceClient = createServiceClient()
    let survey: MarketSurveyRow | null = null

    if (surveyId) {
      // ── Vendor path ─────────────────────────────────────────────
      const supabase = await createClient()
      crumb.auth('Checking vendor auth for survey submit')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw traced.auth('ERR_AUTH_001', 'You must be signed in to submit this survey.')
      }

      // Look up the vendor profile owning this survey
      const { data: vp } = await serviceClient
        .from('vendor_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      const { data: row, error: rowErr } = await serviceClient
        .from('market_surveys')
        .select('*')
        .eq('id', surveyId)
        .maybeSingle()

      if (rowErr) {
        throw traced.fromSupabase(rowErr, { table: 'market_surveys', operation: 'select' })
      }
      if (!row) {
        return NextResponse.json({ error: 'Survey not found.' }, { status: 404 })
      }
      if (row.kind !== 'vendor') {
        return NextResponse.json({ error: 'Survey not found.' }, { status: 404 })
      }
      if (!vp || vp.id !== row.vendor_profile_id) {
        return NextResponse.json(
          { error: 'This survey was sent to another vendor.' },
          { status: 403 }
        )
      }
      survey = row as MarketSurveyRow
    } else if (accessToken) {
      // ── Buyer path ──────────────────────────────────────────────
      if (!isWellFormedSurveyToken(accessToken)) {
        return NextResponse.json({ error: 'Invalid survey link.' }, { status: 400 })
      }
      const { data: row, error: rowErr } = await serviceClient
        .from('market_surveys')
        .select('*')
        .eq('access_token', accessToken)
        .maybeSingle()

      if (rowErr) {
        throw traced.fromSupabase(rowErr, { table: 'market_surveys', operation: 'select' })
      }
      if (!row) {
        return NextResponse.json({ error: 'Survey not found.' }, { status: 404 })
      }
      survey = row as MarketSurveyRow
    }

    if (!survey) {
      return NextResponse.json({ error: 'Survey not found.' }, { status: 404 })
    }

    // ── Common guards ───────────────────────────────────────────────
    if (survey.submitted_at) {
      return NextResponse.json(
        { error: 'This survey has already been submitted. Thanks for your feedback!' },
        { status: 409 }
      )
    }
    if (new Date(survey.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'This survey has closed (more than 30 days after the market day).' },
        { status: 409 }
      )
    }

    // ── Validate + apply ────────────────────────────────────────────
    const kind: SurveyKind = survey.kind
    const validationError = validateSurveySubmission(kind, body)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }
    const update = buildSubmissionUpdate(kind, body)

    crumb.supabase('update', 'market_surveys')
    const { error: updateErr } = await serviceClient
      .from('market_surveys')
      .update(update)
      .eq('id', survey.id)
      .is('submitted_at', null) // race-safe: only blank rows

    if (updateErr) {
      throw traced.fromSupabase(updateErr, { table: 'market_surveys', operation: 'update' })
    }

    return NextResponse.json({ success: true, surveyId: survey.id })
  })
}
