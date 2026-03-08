'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import AdminNav from '@/components/admin/AdminNav'
import { spacing, typography, radius, statusColors, sizing } from '@/lib/design-tokens'
import { exportToCSV } from '@/lib/export-csv'

interface VendorOrder {
  orderNumber: string
  buyerName: string
  buyerEmail: string
  items: string
  mealPriceCents: number
  pickupTime: string | null
  pickupDate: string | null
  status: string
  fulfilled: boolean
  paymentMethod: string
}

interface VendorBreakdown {
  vendorId: string
  vendorName: string
  orders: VendorOrder[]
  totalOrders: number
  stripeOrders: number
  externalOrders: number
  grossRevenueCents: number
  buyerFeeCents: number
  buyerFlatFeeCents: number
  vendorFeeCents: number
  vendorFlatFeeCents: number
  netPayoutCents: number
}

interface SettlementData {
  cateringRequest: {
    id: string
    companyName: string
    contactName: string
    contactEmail: string
    eventDate: string
    eventEndDate: string | null
    eventStartTime: string | null
    eventEndTime: string | null
    headcount: number
    address: string
    city: string
    state: string
    zip: string
    status: string
  }
  market: {
    id: string
    name: string
    address: string
    city: string
    state: string
    zip: string
  } | null
  vendors: VendorBreakdown[]
  acceptedVendorCount: number
  summary: {
    totalOrders: number
    totalItems: number
    totalFulfilledOrders: number
    totalStripeOrders: number
    totalExternalOrders: number
    totalGrossRevenueCents: number
    totalBuyerFeeCents: number
    totalBuyerFlatFeeCents: number
    totalVendorFeeCents: number
    totalVendorFlatFeeCents: number
    totalPlatformRevenueCents: number
    totalVendorPayoutCents: number
    employeePaidCents: number
    companyOwedCents: number
    headcount: number
    participationRate: number
    feeStructure: {
      buyerFeePercent: number
      stripeVendorFeePercent: number
      externalVendorFeePercent: number
      stripeBuyerFlatFeeCents: number
      stripeVendorFlatFeeCents: number
    }
  }
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmtTime(time: string | null): string {
  if (!time) return ''
  const [h, m] = time.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  return `${h12}:${m} ${ampm}`
}

export default function SettlementReportPage() {
  const params = useParams()
  const vertical = params.vertical as string
  const requestId = params.id as string

  const [data, setData] = useState<SettlementData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSettlement() {
      try {
        const res = await fetch(`/api/admin/catering/${requestId}/settlement`)
        if (res.ok) {
          setData(await res.json())
        } else {
          const err = await res.json()
          setError(err.error || 'Failed to load settlement report')
        }
      } catch {
        setError('Network error')
      }
      setLoading(false)
    }
    fetchSettlement()
  }, [requestId])

  function handleExportCSV() {
    if (!data) return
    // Flatten all vendor orders into a single CSV
    const rows: Array<{
      vendor: string
      orderNumber: string
      buyerName: string
      buyerEmail: string
      items: string
      mealPrice: string
      pickupTime: string
      pickupDate: string
      status: string
      fulfilled: string
      paymentMethod: string
    }> = []

    for (const vendor of data.vendors) {
      for (const order of vendor.orders) {
        rows.push({
          vendor: vendor.vendorName,
          orderNumber: order.orderNumber,
          buyerName: order.buyerName,
          buyerEmail: order.buyerEmail,
          items: order.items,
          mealPrice: fmt(order.mealPriceCents),
          pickupTime: order.pickupTime ? fmtTime(order.pickupTime) : '',
          pickupDate: order.pickupDate || '',
          status: order.status,
          fulfilled: order.fulfilled ? 'Yes' : 'No',
          paymentMethod: order.paymentMethod === 'stripe' ? 'Employee Paid' : 'Company Tab',
        })
      }
    }

    const companySlug = data.cateringRequest.companyName.replace(/\s+/g, '_').toLowerCase()
    exportToCSV(rows, `settlement_${companySlug}`, [
      { key: 'vendor', header: 'Vendor' },
      { key: 'orderNumber', header: 'Order #' },
      { key: 'buyerName', header: 'Employee Name' },
      { key: 'buyerEmail', header: 'Employee Email' },
      { key: 'items', header: 'Items' },
      { key: 'mealPrice', header: 'Meal Price' },
      { key: 'pickupTime', header: 'Pickup Time' },
      { key: 'pickupDate', header: 'Pickup Date' },
      { key: 'status', header: 'Status' },
      { key: 'fulfilled', header: 'Fulfilled' },
      { key: 'paymentMethod', header: 'Payment' },
    ])
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px' }}>
        <AdminNav type="vertical" vertical={vertical} />
        <p style={{ color: statusColors.neutral500, textAlign: 'center', marginTop: spacing.xl }}>
          Loading settlement report...
        </p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px' }}>
        <AdminNav type="vertical" vertical={vertical} />
        <div style={{
          padding: spacing.md,
          backgroundColor: statusColors.dangerLight,
          color: statusColors.danger,
          borderRadius: radius.md,
          marginTop: spacing.md,
        }}>
          {error || 'Failed to load settlement report'}
        </div>
        <Link
          href={`/${vertical}/admin/catering`}
          style={{ color: statusColors.infoDark, fontSize: typography.sizes.sm, display: 'inline-block', marginTop: spacing.sm }}
        >
          Back to Catering
        </Link>
      </div>
    )
  }

  const { cateringRequest: req, summary } = data
  const fs = summary.feeStructure

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px' }}>
      {/* Screen-only nav and controls */}
      <div className="no-print">
        <AdminNav type="vertical" vertical={vertical} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
          <Link
            href={`/${vertical}/admin/catering`}
            style={{ color: statusColors.infoDark, fontSize: typography.sizes.sm }}
          >
            Back to Catering
          </Link>
          <div style={{ display: 'flex', gap: spacing.xs }}>
            <button
              onClick={handleExportCSV}
              style={{
                ...sizing.control,
                backgroundColor: statusColors.successLight,
                color: statusColors.successDark,
                border: `1px solid ${statusColors.successBorder}`,
                cursor: 'pointer',
                fontWeight: typography.weights.semibold,
              }}
            >
              Export CSV
            </button>
            <button
              onClick={() => window.print()}
              style={{
                ...sizing.control,
                backgroundColor: statusColors.infoDark,
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontWeight: typography.weights.semibold,
              }}
            >
              Print Report
            </button>
          </div>
        </div>
      </div>

      {/* Print-only header */}
      <div className="print-only" style={{ marginBottom: spacing.md }}>
        <p style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, margin: 0 }}>
          Generated {new Date().toLocaleDateString()} — Local Market Platform
        </p>
      </div>

      {/* Report content (prints cleanly) */}
      <div ref={undefined}>
        {/* Event Header */}
        <div style={{
          padding: spacing.md,
          backgroundColor: statusColors.neutral50,
          borderRadius: radius.lg,
          border: `1px solid ${statusColors.neutral200}`,
          marginBottom: spacing.md,
        }}>
          <h1 style={{
            fontSize: typography.sizes['2xl'],
            fontWeight: typography.weights.bold,
            color: statusColors.neutral900,
            margin: 0,
            marginBottom: spacing['2xs'],
          }}>
            Event Settlement Report
          </h1>
          <h2 style={{
            fontSize: typography.sizes.lg,
            fontWeight: typography.weights.semibold,
            color: statusColors.neutral700,
            margin: 0,
            marginBottom: spacing.sm,
          }}>
            {req.companyName}
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.xs, fontSize: typography.sizes.sm }}>
            <div>
              <span style={{ color: statusColors.neutral500 }}>Event Date: </span>
              <span style={{ color: statusColors.neutral800, fontWeight: typography.weights.semibold }}>
                {fmtDate(req.eventDate)}
                {req.eventEndDate && req.eventEndDate !== req.eventDate && ` — ${fmtDate(req.eventEndDate)}`}
              </span>
            </div>
            <div>
              <span style={{ color: statusColors.neutral500 }}>Time: </span>
              <span style={{ color: statusColors.neutral800 }}>
                {req.eventStartTime ? `${fmtTime(req.eventStartTime)} — ${fmtTime(req.eventEndTime)}` : 'TBD'}
              </span>
            </div>
            <div>
              <span style={{ color: statusColors.neutral500 }}>Location: </span>
              <span style={{ color: statusColors.neutral800 }}>
                {req.address}, {req.city}, {req.state} {req.zip}
              </span>
            </div>
            <div>
              <span style={{ color: statusColors.neutral500 }}>Contact: </span>
              <span style={{ color: statusColors.neutral800 }}>
                {req.contactName} ({req.contactEmail})
              </span>
            </div>
            <div>
              <span style={{ color: statusColors.neutral500 }}>Headcount: </span>
              <span style={{ color: statusColors.neutral800, fontWeight: typography.weights.semibold }}>
                {req.headcount} people
              </span>
            </div>
            <div>
              <span style={{ color: statusColors.neutral500 }}>Trucks: </span>
              <span style={{ color: statusColors.neutral800 }}>
                {data.acceptedVendorCount} accepted
              </span>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: spacing.sm,
          marginBottom: spacing.md,
        }}>
          <SummaryCard label="Total Orders" value={String(summary.totalOrders)} />
          <SummaryCard label="Fulfilled" value={`${summary.totalFulfilledOrders} / ${summary.totalItems} items`} />
          <SummaryCard label="Participation" value={`${summary.participationRate}%`} sub={`${summary.totalOrders} of ${summary.headcount}`} />
          <SummaryCard label="Gross Revenue" value={fmt(summary.totalGrossRevenueCents)} highlight />
        </div>

        {/* Per-Vendor Breakdown */}
        {data.vendors.map((vendor) => (
          <div key={vendor.vendorId} style={{
            marginBottom: spacing.md,
            border: `1px solid ${statusColors.neutral200}`,
            borderRadius: radius.lg,
            overflow: 'hidden',
          }}>
            {/* Vendor header */}
            <div style={{
              padding: `${spacing.xs} ${spacing.sm}`,
              backgroundColor: statusColors.neutral100,
              borderBottom: `1px solid ${statusColors.neutral200}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <h3 style={{
                fontSize: typography.sizes.base,
                fontWeight: typography.weights.bold,
                color: statusColors.neutral800,
                margin: 0,
              }}>
                {vendor.vendorName}
              </h3>
              <span style={{
                fontSize: typography.sizes.sm,
                color: statusColors.neutral600,
              }}>
                {vendor.totalOrders} order{vendor.totalOrders !== 1 ? 's' : ''} &middot; {vendor.orders.length} item{vendor.orders.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Order table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.sizes.sm }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${statusColors.neutral200}` }}>
                    <th style={thStyle}>Order #</th>
                    <th style={thStyle}>Employee</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Items</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Price</th>
                    <th style={thStyle}>Pickup Time</th>
                    <th style={thStyle}>Fulfilled</th>
                    <th style={thStyle}>Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {vendor.orders.map((order, idx) => (
                    <tr key={idx} style={{ borderBottom: `1px solid ${statusColors.neutral100}` }}>
                      <td style={tdStyle}>{order.orderNumber}</td>
                      <td style={tdStyle}>{order.buyerName}</td>
                      <td style={{ ...tdStyle, fontSize: typography.sizes.xs }}>{order.buyerEmail}</td>
                      <td style={tdStyle}>{order.items}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: typography.weights.semibold }}>
                        {fmt(order.mealPriceCents)}
                      </td>
                      <td style={tdStyle}>{order.pickupTime ? fmtTime(order.pickupTime) : '—'}</td>
                      <td style={tdStyle}>
                        <span style={{
                          ...sizing.badge,
                          backgroundColor: order.fulfilled ? statusColors.successLight : statusColors.warningLight,
                          color: order.fulfilled ? statusColors.successDark : statusColors.warningDark,
                        }}>
                          {order.fulfilled ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          ...sizing.badge,
                          backgroundColor: order.paymentMethod === 'stripe' ? statusColors.infoLight : statusColors.neutral100,
                          color: order.paymentMethod === 'stripe' ? statusColors.infoDark : statusColors.neutral600,
                        }}>
                          {order.paymentMethod === 'stripe' ? 'Employee' : 'Company'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Vendor financial summary */}
            <div style={{
              padding: spacing.sm,
              backgroundColor: statusColors.neutral50,
              borderTop: `1px solid ${statusColors.neutral200}`,
              fontSize: typography.sizes.sm,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.xs, marginBottom: spacing.xs }}>
                <div>
                  <span style={{ color: statusColors.neutral500 }}>Gross Sales: </span>
                  <span style={{ fontWeight: typography.weights.semibold, color: statusColors.neutral800 }}>{fmt(vendor.grossRevenueCents)}</span>
                </div>
                <div>
                  <span style={{ color: statusColors.neutral500 }}>Net Vendor Payout: </span>
                  <span style={{ fontWeight: typography.weights.bold, color: statusColors.successDark }}>{fmt(vendor.netPayoutCents)}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: spacing['3xs'], borderTop: `1px solid ${statusColors.neutral200}`, paddingTop: spacing.xs }}>
                <div style={{ color: statusColors.neutral500 }}>
                  Buyer fee ({fs.buyerFeePercent}%): <span style={{ color: statusColors.neutral700 }}>{fmt(vendor.buyerFeeCents)}</span>
                  {vendor.buyerFlatFeeCents > 0 && <> + ${(fs.stripeBuyerFlatFeeCents / 100).toFixed(2)} x {vendor.stripeOrders} = <span style={{ color: statusColors.neutral700 }}>{fmt(vendor.buyerFeeCents + vendor.buyerFlatFeeCents)}</span></>}
                </div>
                <div style={{ color: statusColors.neutral500 }}>
                  Vendor fee ({vendor.externalOrders > 0 && vendor.stripeOrders > 0
                    ? `${fs.stripeVendorFeePercent}% card / ${fs.externalVendorFeePercent}% ext`
                    : vendor.externalOrders > 0
                      ? `${fs.externalVendorFeePercent}%`
                      : `${fs.stripeVendorFeePercent}%`
                  }): <span style={{ color: statusColors.danger }}>-{fmt(vendor.vendorFeeCents)}</span>
                  {vendor.vendorFlatFeeCents > 0 && <> + ${(fs.stripeVendorFlatFeeCents / 100).toFixed(2)} x {vendor.stripeOrders} = <span style={{ color: statusColors.danger }}>-{fmt(vendor.vendorFeeCents + vendor.vendorFlatFeeCents)}</span></>}
                </div>
              </div>
            </div>
          </div>
        ))}

        {data.vendors.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: spacing.xl,
            color: statusColors.neutral500,
            border: `1px solid ${statusColors.neutral200}`,
            borderRadius: radius.lg,
            marginBottom: spacing.md,
          }}>
            <p style={{ fontSize: typography.sizes.lg, margin: 0 }}>No orders yet</p>
            <p style={{ fontSize: typography.sizes.sm, marginTop: spacing['2xs'] }}>
              Orders will appear here once employees start placing pre-orders.
            </p>
          </div>
        )}

        {/* Grand Total / Settlement Summary */}
        {data.vendors.length > 0 && (
          <div style={{
            padding: spacing.md,
            backgroundColor: statusColors.neutral900,
            color: 'white',
            borderRadius: radius.lg,
            marginBottom: spacing.md,
          }}>
            <h3 style={{
              fontSize: typography.sizes.lg,
              fontWeight: typography.weights.bold,
              margin: 0,
              marginBottom: spacing.sm,
            }}>
              Settlement Summary
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: spacing['3xs'], fontSize: typography.sizes.sm }}>
              <SettlementRow
                label={`Total Gross Revenue (${summary.totalOrders} orders, ${summary.totalItems} items)`}
                value={fmt(summary.totalGrossRevenueCents)}
                bold border
              />

              {summary.companyOwedCents > 0 && (
                <>
                  <SettlementRow
                    label={`Paid by employees via card (${summary.totalStripeOrders} orders)`}
                    value={fmt(summary.employeePaidCents)}
                  />
                  <SettlementRow
                    label={`Company owes — external/ticket orders (${summary.totalExternalOrders} orders)`}
                    value={fmt(summary.companyOwedCents)}
                    bold border
                  />
                </>
              )}

              {/* Buyer-side fees */}
              <SettlementRow
                label={`Buyer fees (${fs.buyerFeePercent}%)`}
                value={fmt(summary.totalBuyerFeeCents)}
              />
              {summary.totalBuyerFlatFeeCents > 0 && (
                <SettlementRow
                  label={`Buyer flat fees ($${(fs.stripeBuyerFlatFeeCents / 100).toFixed(2)} x ${summary.totalStripeOrders} card orders)`}
                  value={fmt(summary.totalBuyerFlatFeeCents)}
                />
              )}

              {/* Vendor-side fees */}
              <SettlementRow
                label={`Vendor fees — card at ${fs.stripeVendorFeePercent}%${summary.totalExternalOrders > 0 ? `, external at ${fs.externalVendorFeePercent}%` : ''}`}
                value={fmt(summary.totalVendorFeeCents)}
              />
              {summary.totalVendorFlatFeeCents > 0 && (
                <SettlementRow
                  label={`Vendor flat fees ($${(fs.stripeVendorFlatFeeCents / 100).toFixed(2)} x ${summary.totalStripeOrders} card orders)`}
                  value={fmt(summary.totalVendorFlatFeeCents)}
                />
              )}

              <SettlementRow
                label="Total Platform Revenue (all fees)"
                value={fmt(summary.totalPlatformRevenueCents)}
                bold topBorder
              />
              <SettlementRow
                label="Total Vendor Payouts"
                value={fmt(summary.totalVendorPayoutCents)}
                border
              />

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderTop: '1px solid rgba(255,255,255,0.3)',
                paddingTop: spacing.xs,
                marginTop: spacing['2xs'],
              }}>
                <span style={{ fontWeight: typography.weights.bold as number }}>Booking Fee (enter manually)</span>
                <span style={{ opacity: 0.7, fontStyle: 'italic' }}>$______</span>
              </div>
            </div>
          </div>
        )}

        {/* Ticket Reconciliation */}
        {data.vendors.length > 0 && (
          <div style={{
            padding: spacing.md,
            border: `2px dashed ${statusColors.neutral300}`,
            borderRadius: radius.lg,
            marginBottom: spacing.md,
          }}>
            <h3 style={{
              fontSize: typography.sizes.base,
              fontWeight: typography.weights.bold,
              color: statusColors.neutral700,
              margin: 0,
              marginBottom: spacing.sm,
            }}>
              Ticket Reconciliation
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: spacing.sm, fontSize: typography.sizes.sm }}>
              <ReconcileRow label="Tickets Distributed (Headcount)" value={String(summary.headcount)} />
              <ReconcileRow label="Orders Placed" value={String(summary.totalOrders)} />
              <ReconcileRow label="Items Fulfilled" value={String(summary.totalFulfilledOrders)} />
              <ReconcileRow label="Unfulfilled Items" value={String(summary.totalItems - summary.totalFulfilledOrders)} warn={summary.totalItems - summary.totalFulfilledOrders > 0} />
              <ReconcileRow label="Participation Rate" value={`${summary.participationRate}%`} />
              <ReconcileRow label="Unused Tickets (est.)" value={String(Math.max(0, summary.headcount - summary.totalOrders))} />
            </div>
          </div>
        )}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          @page { margin: 0.5in; }
        }
        @media screen {
          .print-only { display: none !important; }
        }
      `}</style>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: `${spacing['2xs']} ${spacing.xs}`,
  color: statusColors.neutral600,
  fontWeight: typography.weights.semibold as number,
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: `${spacing['2xs']} ${spacing.xs}`,
  color: statusColors.neutral800,
}

function SummaryCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div style={{
      padding: spacing.sm,
      borderRadius: radius.md,
      border: `1px solid ${highlight ? statusColors.successBorder : statusColors.neutral200}`,
      backgroundColor: highlight ? statusColors.successLight : 'white',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: typography.sizes['2xl'],
        fontWeight: typography.weights.bold,
        color: highlight ? statusColors.successDark : statusColors.neutral900,
      }}>
        {value}
      </div>
      <div style={{ fontSize: typography.sizes.xs, color: statusColors.neutral500, marginTop: spacing['3xs'] }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: typography.sizes.xs, color: statusColors.neutral400, marginTop: spacing['3xs'] }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function SettlementRow({ label, value, bold, border, topBorder }: {
  label: string; value: string; bold?: boolean; border?: boolean; topBorder?: boolean
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      ...(border ? { borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: spacing['2xs'] } : {}),
      ...(topBorder ? { borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: spacing['2xs'] } : {}),
    }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={bold ? { fontWeight: typography.weights.bold as number, fontSize: typography.sizes.base } : {}}>
        {value}
      </span>
    </div>
  )
}

function ReconcileRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: `${spacing['2xs']} ${spacing.xs}`,
      backgroundColor: warn ? statusColors.warningLight : 'transparent',
      borderRadius: radius.sm,
    }}>
      <span style={{ color: statusColors.neutral600, fontSize: typography.sizes.sm }}>{label}</span>
      <span style={{
        fontWeight: typography.weights.bold,
        color: warn ? statusColors.warningDark : statusColors.neutral800,
        fontSize: typography.sizes.sm,
      }}>
        {value}
      </span>
    </div>
  )
}
