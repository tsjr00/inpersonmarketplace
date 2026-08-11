import { notFound } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getEventShopData } from '@/lib/events/shop-data'
import { ShopClient } from './ShopClient'

/**
 * Event shop page — server component wrapper.
 *
 * Session 70: split from the previous single client-component
 * implementation. The server does the data fetch at request time and
 * passes the full payload to ShopClient as `initialData`, eliminating
 * the post-hydration fetch waterfall that was the main source of
 * perceived slowness on this page.
 *
 * ShopClient is still `'use client'` (it has to be — it calls
 * `useCart()` which is a React context consumer). All interactivity,
 * state, and mutation handlers stay in ShopClient. This component
 * exists only to do the initial data fetch server-side and thread it
 * in as props.
 */
export default async function EventShopPage({
  params,
}: {
  params: Promise<{ vertical: string; token: string }>
}) {
  const { vertical, token } = await params

  // Cheap format filter so garbage URLs don't reach the database. This is NOT
  // authorisation — getEventShopData still has to resolve the token.
  //
  // ⚠ THIS ALPHABET MUST MATCH THE GENERATOR in lib/events/event-actions.ts.
  // Tokens are `<company-slug>-<18 base64url chars>` (randomBytes(15) with
  // '+' -> '-' and '/' -> '_'), so UPPERCASE and UNDERSCORE are both legal.
  //
  // HISTORY — why this is written down. The guard was added 2026-03-31
  // (754f820b) when the suffix was Date.now().toString(36), i.e. lowercase
  // alphanumeric. On 2026-06-05 (12ee9069) the suffix became base64url for
  // entropy, because the timestamp-derived one was partially brute-forceable
  // and this token is an organizer's ONLY credential. Correct change — but this
  // guard was not updated with it, so it rejected every token minted afterwards
  // and the attendee shop page 404'd for TWO MONTHS. Every menu-item link points
  // here ([token]/page.tsx), so attendees could not order at all. Found by owner
  // testing 2026-08-10, not by any test.
  //
  // Guarded now by flow-integrity -> "Event token format".
  if (!token || token.length < 3 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    notFound()
  }

  // Server knows auth state via cookies; pass through to the lib so
  // price_cents / quantity get gated appropriately, and so the lib
  // can fetch the user's wave reservation if one exists.
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()

  const serviceClient = createServiceClient()
  const data = await getEventShopData(
    serviceClient,
    token,
    user ? { id: user.id } : null
  )

  if (data.reason === 'not_found') {
    notFound()
  }

  return (
    <ShopClient
      vertical={vertical}
      token={token}
      initialData={data}
      isLoggedInInitial={!!user}
    />
  )
}
