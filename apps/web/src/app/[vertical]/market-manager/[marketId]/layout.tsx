import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMarketManagerState } from '@/lib/markets/manager-auth'

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{ vertical: string; marketId: string }>
}

/**
 * Guard layout for all /[vertical]/market-manager/[marketId]/* routes.
 *
 * Runs server-side before any child page renders. Resolves to one of:
 *   - login redirect (no user)
 *   - /access-suspended (current manager, but markets.manager_status = 'suspended')
 *   - /access-removed   (former manager OR no relationship to market)
 *   - render children   (active manager — proceed)
 *
 * Child pages may still re-check via isMarketManager() for defense-in-depth,
 * but suspended/removed users will be redirected here first.
 *
 * Phase 1 of the manager export + lockout plan
 * (apps/web/.claude/manager_export_and_lockout_plan.md). Migration 154 supplies
 * the underlying schema (market_manager_history + markets.manager_status).
 */
export default async function MarketManagerLayout({ children, params }: LayoutProps) {
  const { vertical, marketId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/${vertical}/login`)
  }

  const state = await getMarketManagerState(supabase, marketId, user)

  if (state.state === 'suspended') {
    redirect(`/${vertical}/market-manager/access-suspended?marketId=${marketId}`)
  }

  if (state.state === 'removed' || state.state === 'none') {
    redirect(`/${vertical}/market-manager/access-removed?marketId=${marketId}`)
  }

  // state === 'active' — proceed
  return <>{children}</>
}
