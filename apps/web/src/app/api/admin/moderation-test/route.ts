import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasAdminRole } from '@/lib/auth/admin'

/**
 * GET /api/admin/moderation-test
 * Admin-only diagnostic: tests whether Google Vision API is reachable and working.
 * Uses a small public test image — does NOT upload anything.
 */
export async function GET() {
  // Admin check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, roles')
    .eq('user_id', user.id)
    .single()
  if (!hasAdminRole(profile || {})) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      status: 'NOT_CONFIGURED',
      message: 'GOOGLE_CLOUD_VISION_API_KEY env var is not set',
    })
  }

  // Test with a small, safe public image (Google's own sample)
  try {
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { source: { imageUri: 'https://storage.googleapis.com/cloud-samples-data/vision/label/wakeupcat.jpg' } },
            features: [{ type: 'SAFE_SEARCH_DETECTION' }],
          }],
        }),
      }
    )

    if (!response.ok) {
      const errorBody = await response.text()
      return NextResponse.json({
        status: 'API_ERROR',
        httpStatus: response.status,
        message: 'Google Vision API returned an error',
        details: errorBody.slice(0, 500),
      })
    }

    const data = await response.json()
    const annotation = data.responses?.[0]?.safeSearchAnnotation

    if (!annotation) {
      return NextResponse.json({
        status: 'NO_ANNOTATION',
        message: 'API responded but returned no SafeSearch annotation',
        rawResponse: JSON.stringify(data).slice(0, 500),
      })
    }

    return NextResponse.json({
      status: 'WORKING',
      message: 'Image moderation is active and functioning',
      testImageScores: annotation,
    })
  } catch (error) {
    return NextResponse.json({
      status: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
