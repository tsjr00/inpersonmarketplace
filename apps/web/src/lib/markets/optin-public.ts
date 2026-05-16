import { createServiceClient } from '@/lib/supabase/server'
import {
  OPTIN_CATEGORIES,
  renderOptinStatement,
  type OptinCategory,
} from '@/lib/markets/optin-types'

/**
 * Public-side helpers for fetching a market's selected opt-in statements.
 *
 * These run service-side (mig 137 enabled default-deny RLS on
 * market_optin_selections + market_optin_statement_catalog; only
 * service_role can read). The public-read API at
 * `/api/markets/[id]/optin-public` and the vendor join endpoint both
 * use these helpers.
 *
 * Two shapes are returned in one pass:
 *   - rendered  → UI display: placeholders substituted into the
 *                 statement text. Safe to show to anonymous users.
 *   - snapshot  → Acceptance row storage: raw template + values, so
 *                 vendor_market_agreement_acceptances.statements_snapshot
 *                 is self-contained and survives catalog edits/removals.
 *
 * Schema reference (mig 138):
 *   statements_snapshot JSONB
 *     shape: Array<{ statement_id, category, statement_text, placeholder_values }>
 */

/** What the UI renders for an anonymous or logged-in vendor. */
export interface RenderedStatement {
  statement_id: string
  category: OptinCategory
  category_label: string
  /** Statement text with {placeholders} substituted using the manager's
   *  saved values. Unfilled placeholders pass through as `{name}` so
   *  it's visible if the manager left something blank. */
  rendered_text: string
}

/** What gets written to vendor_market_agreement_acceptances.statements_snapshot.
 *  Self-contained — the original catalog row can be deleted later and this
 *  record still represents what the vendor agreed to. */
export interface SnapshotStatement {
  statement_id: string
  category: OptinCategory
  /** Raw template with placeholders intact ({name}). */
  statement_text: string
  /** Manager-supplied values used at acceptance time. */
  placeholder_values: Record<string, string | number>
}

/**
 * Fetches the market's selected opt-in statements + the catalog rows they
 * reference, joins them, returns both display and snapshot shapes.
 *
 * Returns empty arrays if:
 *   - market_id doesn't exist
 *   - manager has selected no statements
 *   - all selected statements are inactive in the catalog
 *
 * Callers handle the empty case (UI hides the agreement block; join
 * endpoint records an empty snapshot — vendor still gets associated, but
 * the acceptance is a no-op for now and can be re-prompted later if the
 * manager adds statements).
 */
export async function fetchMarketOptinForVendor(
  marketId: string
): Promise<{ rendered: RenderedStatement[]; snapshot: SnapshotStatement[] }> {
  const serviceClient = createServiceClient()

  const { data: selections, error: selErr } = await serviceClient
    .from('market_optin_selections')
    .select('statement_id, placeholder_values')
    .eq('market_id', marketId)

  if (selErr || !selections || selections.length === 0) {
    return { rendered: [], snapshot: [] }
  }

  const statementIds = selections.map((s) => s.statement_id as string)
  const { data: catalog, error: catErr } = await serviceClient
    .from('market_optin_statement_catalog')
    .select('id, category, statement, sort_order')
    .in('id', statementIds)
    .eq('active', true)
    .order('sort_order', { ascending: true })

  if (catErr || !catalog) return { rendered: [], snapshot: [] }

  // Order: walk catalog in sort_order; for each, find the selection's
  // placeholder values. This gives a stable display + snapshot ordering
  // regardless of when each selection was added.
  const rendered: RenderedStatement[] = []
  const snapshot: SnapshotStatement[] = []

  for (const cat of catalog) {
    const sel = selections.find((s) => s.statement_id === cat.id)
    if (!sel) continue // shouldn't happen — IN clause guarantees match
    const placeholderValues = (sel.placeholder_values || {}) as Record<string, string | number>
    const categoryLabel =
      OPTIN_CATEGORIES.find((c) => c.id === cat.category)?.label || (cat.category as string)

    rendered.push({
      statement_id: cat.id as string,
      category: cat.category as OptinCategory,
      category_label: categoryLabel,
      rendered_text: renderOptinStatement(cat.statement as string, placeholderValues),
    })

    snapshot.push({
      statement_id: cat.id as string,
      category: cat.category as OptinCategory,
      statement_text: cat.statement as string,
      placeholder_values: placeholderValues,
    })
  }

  return { rendered, snapshot }
}
