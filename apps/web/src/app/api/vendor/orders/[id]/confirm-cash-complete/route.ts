import { NextResponse } from 'next/server'

/**
 * POST /api/vendor/orders/[id]/confirm-cash-complete
 *
 * DEPRECATED: Cash orders now follow the standard two-step flow:
 * 1. confirm-external-payment (confirm ability to fulfill, no fees)
 * 2. Normal ready → fulfill pipeline (fees recorded at fulfill time)
 *
 * This single-step endpoint is no longer used.
 */
export async function POST() {
  return NextResponse.json({
    error: 'This endpoint is deprecated. Cash orders now use the standard confirm → ready → fulfill flow.',
    code: 'ENDPOINT_DEPRECATED'
  }, { status: 410 })
}
