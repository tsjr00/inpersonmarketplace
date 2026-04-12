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

  // Basic token format check — mirrors the old client-side guard
  if (!token || token.length < 3 || !/^[a-z0-9-]+$/.test(token)) {
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
