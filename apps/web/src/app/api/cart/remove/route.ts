import { NextRequest, NextResponse } from 'next/server'
import { withErrorTracing } from '@/lib/errors'

export async function POST(request: NextRequest) {
  return withErrorTracing('/api/cart/remove', 'POST', async () => {
    const { listingId } = await request.json()

    // Remove from session cart
    // For now, just return success - cart is managed client-side

    return NextResponse.json({ success: true, listingId })
  })
}
