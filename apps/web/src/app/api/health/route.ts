import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// GET /api/health — Simple health check for monitoring
// Verifies: server is running + database is reachable
export async function GET() {
  const start = Date.now()

  try {
    const supabase = createServiceClient()

    // Quick DB connectivity check — single row from a small table
    const { error } = await supabase
      .from('verticals')
      .select('vertical_id')
      .limit(1)
      .single()

    if (error) {
      return NextResponse.json(
        { status: 'unhealthy', db: 'unreachable', error: error.message, latency_ms: Date.now() - start },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { status: 'healthy', db: 'connected', latency_ms: Date.now() - start },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    return NextResponse.json(
      { status: 'unhealthy', error: err instanceof Error ? err.message : 'Unknown error', latency_ms: Date.now() - start },
      { status: 503 }
    )
  }
}
