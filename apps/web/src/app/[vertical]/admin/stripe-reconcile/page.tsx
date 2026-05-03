'use client'

/**
 * Stripe reconciliation tool — admin only.
 *
 * Paste any Stripe ID (pi_/ch_/tr_/po_), an order number, or an email and
 * see how it maps back to platform records. Used for reconciling Stripe
 * dashboard payouts against orders without paging through DB queries.
 *
 * Read-only in v1. Refunds / retries / mark-resolved actions are deferred
 * to a separate batch (each is a critical-path concern).
 */

import { useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AdminNav from '@/components/admin/AdminNav'
import { spacing, typography, radius, statusColors, sizing } from '@/lib/design-tokens'

// Mirror of the lib types — kept loose for simplicity (no shared types package)
interface MatchedOrder {
  orderType: string
  orderNumber: string | null
  orderId: string | null
  buyerName: string | null
  buyerEmail: string | null
  vendorName: string | null
  amountCents: number | null
  platformFeeCents: number | null
  vertical: string | null
  status: string | null
  matchedVia: string
  stripeIds: {
    payment_intent_id?: string | null
    charge_id?: string | null
    transfer_ids?: string[]
  }
}

interface MetadataCompleteness {
  has_order_number: boolean
  has_order_id: boolean
  missingFields: string[]
}

interface MatchResult {
  stripeObject: {
    type: string
    id: string
    amountCents: number | null
    createdAt: string | null
    status: string | null
    metadata: Record<string, string>
    raw: Record<string, unknown>
  } | null
  matchedOrders: MatchedOrder[]
  metadataCompleteness: MetadataCompleteness
  warnings: string[]
}

interface PayoutLine {
  balanceTransactionId: string
  type: string
  amountCents: number
  netCents: number
  feeCents: number
  sourceId: string | null
  match: MatchResult | null
}

interface PayoutResult {
  payout: MatchResult['stripeObject']
  lines: PayoutLine[]
  totals: { grossCents: number; feeCents: number; netCents: number }
}

type ApiResponse =
  | { type: 'order_number' | 'email' | 'stripe_object'; result: MatchResult }
  | { type: 'payout'; result: PayoutResult }
  | { type: 'unknown' | 'unsupported'; error: string }

function fmtCents(cents: number | null): string {
  if (cents === null || cents === undefined) return '—'
  const negative = cents < 0
  const abs = Math.abs(cents)
  return `${negative ? '−' : ''}$${(abs / 100).toFixed(2)}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function stripeDashboardUrl(type: string, id: string): string {
  const base = 'https://dashboard.stripe.com'
  switch (type) {
    case 'payment_intent': return `${base}/payments/${id}`
    case 'charge': return `${base}/payments/${id}`  // charges redirect to their PI
    case 'transfer': return `${base}/connect/transfers/${id}`
    case 'payout': return `${base}/payouts/${id}`
    default: return `${base}/search?query=${encodeURIComponent(id)}`
  }
}

export default function StripeReconcilePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const vertical = params.vertical as string
  const initialQuery = (searchParams.get('q') || '').trim()

  const [query, setQuery] = useState(initialQuery)
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<ApiResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  async function runSearch(q: string) {
    if (!q.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/stripe-reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q.trim(), vertical }),
      })
      const data = await res.json()
      if (!res.ok && !('result' in data)) {
        setError(data.error || `Request failed (${res.status})`)
        setResponse(null)
      } else {
        setResponse(data as ApiResponse)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  // Auto-search if ?q= came in via URL (from settlement page link icon)
  // Note: useEffect not used here on purpose — we want a single fire on mount.
  // useState initializer + a one-shot dispatch:
  if (initialQuery && !response && !loading && !error) {
    // Defer to next tick so render completes
    queueMicrotask(() => runSearch(initialQuery))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    runSearch(query)
  }

  function handleRefresh() {
    if (query) runSearch(query)
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: spacing.lg }}>
      <AdminNav type="vertical" vertical={vertical} />
      <div style={{ marginBottom: spacing.lg }}>
        <h1 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, margin: 0 }}>
          Stripe Reconciliation
        </h1>
        <p style={{ fontSize: typography.sizes.sm, color: statusColors.neutral500, margin: `${spacing['2xs']} 0 0` }}>
          Paste a Stripe ID (pi_/ch_/tr_/po_), an order number (FA-2026-...), or a buyer email to trace the money.
          Each search makes 0–2 Stripe API calls. No background polling.
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSubmit} style={{ marginBottom: spacing.lg }}>
        <div style={{ display: 'flex', gap: spacing.xs }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="pi_3X… / ch_3X… / tr_1X… / po_1X… / FA-2026-XXXXXXXX / email@example.com"
            style={{
              flex: 1,
              padding: sizing.control.padding,
              fontSize: sizing.control.fontSize,
              border: `1px solid ${statusColors.neutral300}`,
              borderRadius: radius.md,
              minHeight: sizing.control.minHeight,
              fontFamily: 'monospace',
            }}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{
              ...sizing.cta,
              backgroundColor: loading ? statusColors.neutral400 : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: radius.md,
              fontWeight: typography.weights.semibold,
              cursor: loading ? 'not-allowed' : 'pointer',
              padding: `0 ${spacing.md}`,
            }}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
          {response && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              title="Re-run the same search"
              style={{
                ...sizing.cta,
                backgroundColor: 'white',
                color: statusColors.neutral700,
                border: `1px solid ${statusColors.neutral300}`,
                borderRadius: radius.md,
                cursor: loading ? 'not-allowed' : 'pointer',
                padding: `0 ${spacing.md}`,
              }}
            >
              ↻ Refresh
            </button>
          )}
        </div>
      </form>

      {error && (
        <div style={{
          padding: spacing.sm,
          marginBottom: spacing.md,
          backgroundColor: statusColors.dangerLight,
          border: `1px solid ${statusColors.dangerBorder}`,
          borderRadius: radius.md,
          color: statusColors.dangerDark,
        }}>
          {error}
        </div>
      )}

      {response && 'error' in response && (
        <div style={{
          padding: spacing.sm,
          marginBottom: spacing.md,
          backgroundColor: statusColors.warningLight,
          border: `1px solid ${statusColors.warningBorder}`,
          borderRadius: radius.md,
          color: statusColors.warningDark,
        }}>
          {response.error}
        </div>
      )}

      {response && 'result' in response && response.type === 'payout' && (
        <PayoutAuditView result={response.result} vertical={vertical} />
      )}

      {response && 'result' in response && response.type !== 'payout' && (
        <SingleResultView result={response.result} vertical={vertical} showRaw={showRaw} setShowRaw={setShowRaw} />
      )}

      {!response && !loading && !error && (
        <div style={{
          padding: spacing.lg,
          backgroundColor: statusColors.neutral50,
          border: `1px dashed ${statusColors.neutral300}`,
          borderRadius: radius.md,
          textAlign: 'center',
          color: statusColors.neutral500,
        }}>
          <p style={{ margin: 0, fontSize: typography.sizes.sm }}>
            Enter a query above to begin. Examples:
          </p>
          <ul style={{
            display: 'inline-block',
            textAlign: 'left',
            margin: `${spacing.xs} auto 0`,
            paddingLeft: spacing.lg,
            fontSize: typography.sizes.sm,
            color: statusColors.neutral600,
          }}>
            <li><code>pi_3R…</code> — paste from Stripe dashboard payment</li>
            <li><code>tr_1R…</code> — vendor transfer</li>
            <li><code>po_1R…</code> — payout (audit view with line breakdown)</li>
            <li><code>FA-2026-12345678</code> — find Stripe IDs for an order</li>
            <li><code>buyer@example.com</code> — list buyer&apos;s recent orders</li>
          </ul>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────

function SingleResultView({
  result,
  vertical,
  showRaw,
  setShowRaw,
}: {
  result: MatchResult
  vertical: string
  showRaw: boolean
  setShowRaw: (v: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
      {/* Stripe object summary */}
      {result.stripeObject && (
        <Card title="Stripe object">
          <KV label="Type" value={result.stripeObject.type} mono />
          <KV label="ID" value={result.stripeObject.id} mono />
          <KV label="Amount" value={fmtCents(result.stripeObject.amountCents)} />
          <KV label="Status" value={result.stripeObject.status || '—'} />
          <KV label="Created" value={fmtDate(result.stripeObject.createdAt)} />
          <KV
            label="Open in Stripe"
            value={
              <a href={stripeDashboardUrl(result.stripeObject.type, result.stripeObject.id)}
                 target="_blank" rel="noopener noreferrer"
                 style={{ color: '#2563eb', textDecoration: 'none' }}>
                dashboard.stripe.com ↗
              </a>
            }
          />

          {/* Metadata completeness — A-readiness flags */}
          <div style={{
            marginTop: spacing.sm,
            padding: spacing.sm,
            backgroundColor: result.metadataCompleteness.missingFields.length === 0
              ? statusColors.successLight
              : statusColors.warningLight,
            border: `1px solid ${result.metadataCompleteness.missingFields.length === 0
              ? statusColors.successBorder
              : statusColors.warningBorder}`,
            borderRadius: radius.sm,
            fontSize: typography.sizes.xs,
          }}>
            <strong>Metadata completeness:</strong>{' '}
            {result.metadataCompleteness.has_order_number ? '✓ order_number' : '✗ order_number'}{' · '}
            {result.metadataCompleteness.has_order_id ? '✓ order_id' : '✗ order_id'}
            {result.metadataCompleteness.missingFields.length > 0 && (
              <div style={{ marginTop: 4, color: statusColors.neutral600 }}>
                Missing: {result.metadataCompleteness.missingFields.join(', ')}.
                When the metadata enrichment pass ships, these will be set automatically.
              </div>
            )}
          </div>

          {/* Raw metadata + raw object toggle */}
          <div style={{ marginTop: spacing.sm }}>
            <button
              onClick={() => setShowRaw(!showRaw)}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563eb',
                cursor: 'pointer',
                padding: 0,
                fontSize: typography.sizes.xs,
              }}
            >
              {showRaw ? '▾' : '▸'} Show raw Stripe object
            </button>
            {showRaw && (
              <pre style={{
                marginTop: spacing.xs,
                padding: spacing.sm,
                backgroundColor: statusColors.neutral50,
                border: `1px solid ${statusColors.neutral200}`,
                borderRadius: radius.sm,
                fontSize: 11,
                overflow: 'auto',
                maxHeight: 400,
              }}>
                {JSON.stringify(result.stripeObject.raw, null, 2)}
              </pre>
            )}
          </div>
        </Card>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <Card title="Notes">
          <ul style={{ margin: 0, paddingLeft: spacing.md, fontSize: typography.sizes.sm, color: statusColors.warningDark }}>
            {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </Card>
      )}

      {/* Matched orders */}
      <Card title={`Matched orders (${result.matchedOrders.length})`}>
        {result.matchedOrders.length === 0 ? (
          <p style={{ margin: 0, color: statusColors.neutral500, fontSize: typography.sizes.sm }}>
            No matching records found.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.sizes.sm }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${statusColors.neutral200}`, textAlign: 'left' }}>
                <th style={{ padding: spacing['2xs'] }}>Type</th>
                <th style={{ padding: spacing['2xs'] }}>Order #</th>
                <th style={{ padding: spacing['2xs'] }}>Buyer</th>
                <th style={{ padding: spacing['2xs'] }}>Vendor</th>
                <th style={{ padding: spacing['2xs'], textAlign: 'right' }}>Amount</th>
                <th style={{ padding: spacing['2xs'], textAlign: 'right' }}>Platform revenue</th>
                <th style={{ padding: spacing['2xs'] }}>Status</th>
                <th style={{ padding: spacing['2xs'] }}>Vertical</th>
                <th style={{ padding: spacing['2xs'] }}>Matched via</th>
              </tr>
            </thead>
            <tbody>
              {result.matchedOrders.map((m, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${statusColors.neutral100}` }}>
                  <td style={{ padding: spacing['2xs'] }}>{m.orderType}</td>
                  <td style={{ padding: spacing['2xs'], fontFamily: 'monospace' }}>
                    {m.orderNumber || (m.orderId ? <span title={m.orderId}>{m.orderId.slice(0, 8)}…</span> : '—')}
                  </td>
                  <td style={{ padding: spacing['2xs'] }}>
                    {m.buyerName || m.buyerEmail || '—'}
                    {m.buyerEmail && m.buyerName && (
                      <div style={{ fontSize: 11, color: statusColors.neutral500 }}>{m.buyerEmail}</div>
                    )}
                  </td>
                  <td style={{ padding: spacing['2xs'] }}>{m.vendorName || '—'}</td>
                  <td style={{ padding: spacing['2xs'], textAlign: 'right', fontFamily: 'monospace' }}>{fmtCents(m.amountCents)}</td>
                  <td style={{ padding: spacing['2xs'], textAlign: 'right', fontFamily: 'monospace' }}>{fmtCents(m.platformFeeCents)}</td>
                  <td style={{ padding: spacing['2xs'] }}>{m.status || '—'}</td>
                  <td style={{ padding: spacing['2xs'], fontSize: typography.sizes.xs }}>{m.vertical || '—'}</td>
                  <td style={{ padding: spacing['2xs'], fontSize: typography.sizes.xs, color: statusColors.neutral500 }}>{m.matchedVia}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Cross-reference Stripe IDs */}
        {result.matchedOrders.some(m => m.stripeIds.payment_intent_id || m.stripeIds.transfer_ids?.length) && (
          <div style={{ marginTop: spacing.sm, fontSize: typography.sizes.xs, color: statusColors.neutral600 }}>
            <strong>Related Stripe IDs:</strong>
            {result.matchedOrders.map((m, i) => (
              <div key={i} style={{ marginTop: 4 }}>
                {m.stripeIds.payment_intent_id && (
                  <span style={{ marginRight: spacing.sm }}>
                    PI:{' '}
                    <Link href={`/${vertical}/admin/stripe-reconcile?q=${m.stripeIds.payment_intent_id}`}
                          style={{ fontFamily: 'monospace', color: '#2563eb' }}>
                      {m.stripeIds.payment_intent_id}
                    </Link>
                  </span>
                )}
                {m.stripeIds.transfer_ids?.map(tid => (
                  <span key={tid} style={{ marginRight: spacing.sm }}>
                    Transfer:{' '}
                    <Link href={`/${vertical}/admin/stripe-reconcile?q=${tid}`}
                          style={{ fontFamily: 'monospace', color: '#2563eb' }}>
                      {tid}
                    </Link>
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────

function PayoutAuditView({ result, vertical }: { result: PayoutResult; vertical: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
      {/* Payout summary */}
      <Card title="Payout">
        {result.payout && (
          <>
            <KV label="ID" value={result.payout.id} mono />
            <KV label="Amount (net)" value={fmtCents(result.payout.amountCents)} />
            <KV label="Status" value={result.payout.status || '—'} />
            <KV label="Created" value={fmtDate(result.payout.createdAt)} />
            <KV
              label="Open in Stripe"
              value={
                <a href={stripeDashboardUrl('payout', result.payout.id)}
                   target="_blank" rel="noopener noreferrer"
                   style={{ color: '#2563eb', textDecoration: 'none' }}>
                  dashboard.stripe.com ↗
                </a>
              }
            />
          </>
        )}

        {/* Totals — payout BT itself excluded so net != 0. Platform revenue
            sums each unique matched order's platform_fee_cents (orders.platform_fee_cents),
            de-duplicated by order id so multi-vendor orders aren't counted twice. */}
        {(() => {
          const seenOrderIds = new Set<string>()
          let platformRevenueCents = 0
          for (const line of result.lines) {
            const m = line.match?.matchedOrders[0]
            if (!m || !m.orderId || m.platformFeeCents == null) continue
            if (seenOrderIds.has(m.orderId)) continue
            seenOrderIds.add(m.orderId)
            platformRevenueCents += m.platformFeeCents
          }
          return (
            <div style={{
              marginTop: spacing.sm,
              padding: spacing.sm,
              backgroundColor: statusColors.neutral50,
              borderRadius: radius.sm,
              fontSize: typography.sizes.sm,
            }}>
              <strong>Totals:</strong>{' '}
              gross {fmtCents(result.totals.grossCents)}{' · '}
              Stripe fees {fmtCents(result.totals.feeCents)}{' · '}
              net {fmtCents(result.totals.netCents)}{' · '}
              <strong>platform revenue {fmtCents(platformRevenueCents)}</strong>
              <div style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, marginTop: 4 }}>
                Platform revenue is per-order Stripe-side fees retained (orders.platform_fee_cents).
                External-payment orders never reach Stripe and are not included.
              </div>
            </div>
          )
        })()}
      </Card>

      {/* Lines */}
      <Card title={`Balance transactions (${result.lines.length})`}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.sizes.sm }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${statusColors.neutral200}`, textAlign: 'left' }}>
              <th style={{ padding: spacing['2xs'] }}>Type</th>
              <th style={{ padding: spacing['2xs'], textAlign: 'right' }}>Amount</th>
              <th style={{ padding: spacing['2xs'], textAlign: 'right' }} title="Stripe processing fee. Platform fee is the difference between charge and transfer amounts.">Stripe fee</th>
              <th style={{ padding: spacing['2xs'], textAlign: 'right' }}>Net</th>
              <th style={{ padding: spacing['2xs'], textAlign: 'right' }}>Platform revenue</th>
              <th style={{ padding: spacing['2xs'] }}>Source</th>
              <th style={{ padding: spacing['2xs'] }}>Matched order</th>
            </tr>
          </thead>
          <tbody>
            {result.lines.map((line) => {
              const m = line.match?.matchedOrders[0]
              return (
                <tr key={line.balanceTransactionId} style={{ borderBottom: `1px solid ${statusColors.neutral100}` }}>
                  <td style={{ padding: spacing['2xs'] }}>{line.type}</td>
                  <td style={{ padding: spacing['2xs'], textAlign: 'right', fontFamily: 'monospace' }}>{fmtCents(line.amountCents)}</td>
                  <td style={{ padding: spacing['2xs'], textAlign: 'right', fontFamily: 'monospace', color: statusColors.neutral500 }}>{fmtCents(line.feeCents)}</td>
                  <td style={{ padding: spacing['2xs'], textAlign: 'right', fontFamily: 'monospace' }}>{fmtCents(line.netCents)}</td>
                  <td style={{ padding: spacing['2xs'], textAlign: 'right', fontFamily: 'monospace' }}>
                    {/* Show platform revenue only on the charge row — transfer rows
                        don't add to platform revenue (they reduce it). */}
                    {line.type === 'charge' && m?.platformFeeCents != null
                      ? fmtCents(m.platformFeeCents)
                      : '—'}
                  </td>
                  <td style={{ padding: spacing['2xs'], fontFamily: 'monospace', fontSize: 11 }}>
                    {line.sourceId ? (
                      <Link href={`/${vertical}/admin/stripe-reconcile?q=${line.sourceId}`} style={{ color: '#2563eb' }}>
                        {line.sourceId}
                      </Link>
                    ) : '—'}
                  </td>
                  <td style={{ padding: spacing['2xs'] }}>
                    {m ? (
                      <span>
                        {m.orderNumber || m.orderId?.slice(0, 8) || '—'}
                        {m.buyerName && <span style={{ color: statusColors.neutral500, marginLeft: 6, fontSize: 11 }}>{m.buyerName}</span>}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: 'white',
      border: `1px solid ${statusColors.neutral200}`,
      borderRadius: radius.md,
      padding: spacing.md,
    }}>
      <h3 style={{ margin: 0, marginBottom: spacing.sm, fontSize: typography.sizes.base, fontWeight: typography.weights.semibold }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: spacing.xs, padding: '4px 0', fontSize: typography.sizes.sm }}>
      <span style={{ color: statusColors.neutral500 }}>{label}</span>
      <span style={{ fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  )
}
