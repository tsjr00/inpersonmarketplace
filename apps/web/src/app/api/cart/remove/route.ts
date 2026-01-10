import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { listingId } = await request.json()

  // Remove from session cart
  // For now, just return success - cart is managed client-side

  return NextResponse.json({ success: true, listingId })
}
