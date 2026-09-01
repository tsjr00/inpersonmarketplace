'use client'

/**
 * ReportsAdminPage — the ONE implementation behind /admin/reports and
 * /[vertical]/admin/reports (admin UI rebuild phase 3, merge 10/11, owner
 * 2026-08-31). ⚠ money: the report GENERATORS are untouched — both copies
 * already POST the same /api/admin/reports route, whose verifyAdminScope +
 * ADM-1 fallback force vertical admins to their own vertical server-side.
 * This merge changes NO report id, description, generator, or request body
 * semantics. Per-mode surfaces preserved exactly:
 *   platform — the vertical selector (all | each) and the six ACCOUNTING
 *   reports (reconciliation, refund detail, external fee ledger,
 *   subscription revenue, tax summary, monthly P&L);
 *   vertical — the CSV | Quality Checks tabs (nightly vendor-quality scan
 *   history + active findings via /api/admin/quality-checks), no vertical
 *   selector (the API scopes server-side), no accounting category.
 * NOTE (owner-flagged 2026-08-31, pre-existing): the accounting category is
 * curated client-side only — the API serves those reports (vertical-scoped)
 * to any admin who posts the reportId directly.
 *
 * `vertical === undefined` = platform view.
 */

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows, statusColors } from '@/lib/design-tokens'
import { useStatusBanner } from '@/hooks/useStatusBanner'

type TabType = 'csv' | 'quality'

// ── CSV Reports Types & Data ──────────────────────────────────

interface ReportOption {
  id: string
  name: string
  description: string
  category: 'sales' | 'operations' | 'vendors' | 'customers' | 'inventory' | 'accounting'
}

/** Shared across both tiers; the 'accounting' category renders only in
 *  platform mode (exactly the split the two pre-merge pages had). */
const AVAILABLE_REPORTS: ReportOption[] = [
  // Sales & Revenue
  { id: 'sales_summary', name: 'Sales Summary', description: 'Total orders, revenue, avg order value, breakdown by market and time period', category: 'sales' },
  { id: 'revenue_fees', name: 'Revenue & Platform Fees', description: 'Gross sales, platform fees collected, vendor payouts, net platform revenue', category: 'sales' },
  { id: 'sales_by_category', name: 'Sales by Category', description: 'Revenue and order count broken down by product category', category: 'sales' },
  // Operations
  { id: 'order_details', name: 'Order Details', description: 'All orders with line items, customer, vendor, market, status, timestamps', category: 'operations' },
  { id: 'order_status', name: 'Order Status Summary', description: 'Orders grouped by status with counts and percentages', category: 'operations' },
  { id: 'cancellations', name: 'Cancellations & Refunds', description: 'Cancelled orders/items, reasons, who cancelled, refund amounts', category: 'operations' },
  { id: 'market_performance', name: 'Market Performance', description: 'Each market\'s order count, revenue, unique customers, unique vendors', category: 'operations' },
  // Vendors
  { id: 'vendor_performance', name: 'Vendor Performance', description: 'Sales, order count, avg fulfillment time, cancellation rate per vendor', category: 'vendors' },
  { id: 'vendor_payouts', name: 'Vendor Payouts', description: 'Payout details: gross sales, platform fees, net payout, payout status', category: 'vendors' },
  { id: 'vendor_roster', name: 'Vendor Roster', description: 'All vendors with tier, status, contact info, markets, listing count', category: 'vendors' },
  // Customers
  { id: 'customer_summary', name: 'Customer Summary', description: 'Order count, total spent, last order date, preferred market per customer', category: 'customers' },
  { id: 'top_customers', name: 'Top Customers', description: 'Highest spending customers with order history summary', category: 'customers' },
  { id: 'customer_retention', name: 'Customer Retention', description: 'New vs returning customers, repeat purchase rate by period', category: 'customers' },
  // Inventory
  { id: 'listing_inventory', name: 'Listing Inventory', description: 'All listings with status, price, vendor, category, stock availability', category: 'inventory' },
  { id: 'product_performance', name: 'Product Performance', description: 'Each listing\'s order count, revenue, and popularity ranking', category: 'inventory' },
  // Accounting (platform mode only)
  { id: 'transaction_reconciliation', name: 'Transaction Reconciliation', description: 'Every payment with Stripe IDs, buyer paid, vendor payout, platform revenue, transfer IDs — for bank statement reconciliation', category: 'accounting' },
  { id: 'refund_detail', name: 'Refund Detail', description: 'All cancellations with original amount, refund amount, cancellation fees, who cancelled, reason', category: 'accounting' },
  { id: 'external_fee_ledger', name: 'External Payment Fee Ledger', description: 'Full external payment report: every Venmo/CashApp/PayPal/cash transaction with buyer fees, vendor fees owed, collection status, and vendor balance summary', category: 'accounting' },
  { id: 'subscription_revenue', name: 'Subscription Revenue', description: 'Vendor tier subscriptions (Pro/Boss) and buyer premium — subscriber list, billing cycle, Stripe subscription IDs', category: 'accounting' },
  { id: 'tax_summary', name: 'Tax Summary by State', description: 'Gross sales and platform fee revenue grouped by state — for sales tax and income tax reporting', category: 'accounting' },
  { id: 'monthly_pnl', name: 'Monthly P&L', description: 'Monthly profit & loss: platform revenue, vendor payouts, refunds, estimated Stripe costs, estimated net income', category: 'accounting' },
]

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  sales: { label: 'Sales & Revenue', color: '#10b981' },
  operations: { label: 'Operations', color: '#3b82f6' },
  vendors: { label: 'Vendors', color: '#8b5cf6' },
  customers: { label: 'Customers', color: '#f59e0b' },
  inventory: { label: 'Inventory', color: '#ec4899' },
  accounting: { label: 'Accounting', color: '#dc2626' },
}

// ── Quality Checks Types (vertical mode only) ─────────────────

interface ScanLogEntry {
  id: string
  started_at: string
  completed_at: string | null
  vendors_scanned: number
  findings_created: number
  findings_by_check: Record<string, number> | null
  status: string
  error_message: string | null
}

interface QualityFindingAdmin {
  id: string
  vendor_profile_id: string
  vertical_id: string
  check_type: string
  severity: string
  title: string
  message: string
  details: Record<string, unknown>
  vendorName: string
  created_at: string
}

const CHECK_LABELS: Record<string, string> = {
  schedule_conflict: 'Schedule Conflict',
  low_stock_event: 'Low Stock + Event',
  price_anomaly: 'Price Anomaly',
  ghost_listing: 'Ghost Listing',
  inventory_velocity: 'Inventory Velocity',
}

const SEVERITY_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  action_required: { label: 'Action Required', color: statusColors.danger, bg: statusColors.dangerLight },
  heads_up: { label: 'Heads Up', color: statusColors.warning, bg: statusColors.warningLight },
  suggestion: { label: 'Suggestion', color: statusColors.info, bg: statusColors.infoLight },
}

interface Vertical {
  id: string
  name: string
}

export default function ReportsAdminPage({ vertical }: { vertical?: string }) {
  const isPlatform = !vertical
  const { showBanner, StatusBanner } = useStatusBanner()

  const [activeTab, setActiveTab] = useState<TabType>('csv')

  // CSV Reports state
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set())
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<string[]>([])

  // Platform mode: vertical selector
  const [verticals, setVerticals] = useState<Vertical[]>([])
  const [selectedVertical, setSelectedVertical] = useState<string>('all')
  const [loadingVerticals, setLoadingVerticals] = useState(isPlatform)

  // Vertical mode: quality checks
  const [scanHistory, setScanHistory] = useState<ScanLogEntry[]>([])
  const [findings, setFindings] = useState<QualityFindingAdmin[]>([])
  const [qcLoading, setQcLoading] = useState(false)
  const [qcRunning, setQcRunning] = useState(false)
  const [qcSummary, setQcSummary] = useState<{ totalActive: number; byCheck: Record<string, number>; bySeverity: Record<string, number> } | null>(null)

  const modeReports = isPlatform ? AVAILABLE_REPORTS : AVAILABLE_REPORTS.filter(r => r.category !== 'accounting')
  const modeCategories = Object.fromEntries(Object.entries(CATEGORY_LABELS).filter(([cat]) => isPlatform || cat !== 'accounting'))

  useEffect(() => {
    if (!isPlatform) return
    async function fetchVerticals() {
      try {
        const response = await fetch('/api/admin/verticals')
        if (response.ok) {
          const data = await response.json()
          setVerticals(data.verticals || [])
        }
      } catch (error) {
        console.error('Failed to fetch verticals:', error)
      } finally {
        setLoadingVerticals(false)
      }
    }
    fetchVerticals()
  }, [isPlatform])

  const fetchQualityData = useCallback(async () => {
    if (!vertical) return
    setQcLoading(true)
    try {
      const res = await fetch(`/api/admin/quality-checks?vertical=${vertical}`)
      if (res.ok) {
        const data = await res.json()
        setScanHistory(data.scanHistory || [])
        setFindings(data.findings || [])
        setQcSummary(data.summary || null)
      }
    } catch {
      // Non-critical
    } finally {
      setQcLoading(false)
    }
  }, [vertical])

  useEffect(() => {
    if (!isPlatform && activeTab === 'quality') {
      fetchQualityData()
    }
  }, [isPlatform, activeTab, fetchQualityData])

  const toggleReport = (reportId: string) => {
    const newSelected = new Set(selectedReports)
    if (newSelected.has(reportId)) newSelected.delete(reportId)
    else newSelected.add(reportId)
    setSelectedReports(newSelected)
  }

  const selectAll = () => setSelectedReports(new Set(modeReports.map(r => r.id)))
  const selectNone = () => setSelectedReports(new Set())
  const selectCategory = (category: string) => {
    const categoryReports = modeReports.filter(r => r.category === category).map(r => r.id)
    const newSelected = new Set(selectedReports)
    categoryReports.forEach(id => newSelected.add(id))
    setSelectedReports(newSelected)
  }

  const runReports = async () => {
    if (selectedReports.size === 0) {
      showBanner('warning', 'Please select at least one report to run.')
      return
    }
    setRunning(true)
    setProgress([])
    const reportIds = Array.from(selectedReports)
    for (const reportId of reportIds) {
      const report = modeReports.find(r => r.id === reportId)
      setProgress(prev => [...prev, `Generating ${report?.name}...`])
      try {
        // Request bodies exactly as each pre-merge page sent them: platform
        // includes verticalId only when a specific vertical is picked;
        // vertical mode sends none (ADM-1 scopes it server-side).
        const response = await fetch('/api/admin/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reportId,
            dateFrom,
            dateTo,
            ...(isPlatform && selectedVertical !== 'all' ? { verticalId: selectedVertical } : {}),
          })
        })
        if (!response.ok) {
          const error = await response.json()
          setProgress(prev => [...prev, `  Error: ${error.error || 'Failed to generate'}`])
          continue
        }
        const contentDisposition = response.headers.get('Content-Disposition')
        const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/)
        const filename = filenameMatch?.[1] || `${reportId}_${dateFrom}_${dateTo}.csv`
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
        setProgress(prev => [...prev, `  Downloaded: ${filename}`])
      } catch (err) {
        setProgress(prev => [...prev, `  Error: ${err instanceof Error ? err.message : 'Unknown error'}`])
      }
    }
    setProgress(prev => [...prev, 'All reports complete!'])
    setRunning(false)
  }

  const runQualityChecks = async () => {
    setQcRunning(true)
    try {
      const res = await fetch('/api/admin/quality-checks', { method: 'POST' })
      if (res.ok) await fetchQualityData()
    } catch {
      // Non-critical
    } finally {
      setQcRunning(false)
    }
  }

  const reportsByCategory = modeReports.reduce((acc, report) => {
    if (!acc[report.category]) acc[report.category] = []
    acc[report.category].push(report)
    return acc
  }, {} as Record<string, ReportOption[]>)

  const tabButton = (tab: TabType, label: React.ReactNode) => (
    <button
      onClick={() => setActiveTab(tab)}
      style={{
        padding: `${spacing.sm} ${spacing.md}`,
        backgroundColor: 'transparent',
        border: 'none',
        borderBottom: activeTab === tab ? `3px solid ${colors.primary}` : '3px solid transparent',
        color: activeTab === tab ? colors.primary : colors.textSecondary,
        fontSize: typography.sizes.base,
        fontWeight: activeTab === tab ? typography.weights.semibold : typography.weights.normal,
        cursor: 'pointer',
        marginBottom: -2,
        display: 'flex',
        alignItems: 'center',
        gap: spacing['2xs'],
      }}
    >
      {label}
    </button>
  )

  const showCsv = isPlatform || activeTab === 'csv'

  return (
    <div style={{ padding: spacing.lg, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, marginBottom: spacing.sm, color: colors.textPrimary }}>
        Reports
      </h1>

      {/* Tabs — vertical mode only (the platform page never had them) */}
      {!isPlatform && (
        <div style={{ display: 'flex', gap: 0, marginBottom: spacing.lg, borderBottom: `2px solid ${colors.border}` }}>
          {tabButton('csv', 'CSV Reports')}
          {tabButton('quality', (
            <>
              Quality Checks
              {qcSummary && qcSummary.totalActive > 0 && (
                <span style={{ padding: `1px ${spacing['2xs']}`, backgroundColor: statusColors.warning, color: 'white', borderRadius: radius.full, fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, minWidth: 20, textAlign: 'center' }}>
                  {qcSummary.totalActive}
                </span>
              )}
            </>
          ))}
        </div>
      )}

      {/* ── CSV REPORTS ─────────────────────────────────────────── */}
      {showCsv && (
        <>
          <p style={{ color: colors.textSecondary, marginBottom: spacing.lg, marginTop: 0 }}>
            Select reports to generate and download as CSV files for analysis in Excel or other tools.
          </p>

          {/* Filters */}
          <div style={{ backgroundColor: colors.surfaceElevated, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.lg, border: `1px solid ${colors.border}` }}>
            <h2 style={{ fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, marginBottom: spacing.sm, marginTop: 0, color: colors.textPrimary }}>
              {isPlatform ? 'Filters' : 'Date Range'}
            </h2>
            <div style={{ display: 'flex', gap: spacing.lg, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {isPlatform && (
                <div>
                  <label style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, display: 'block', marginBottom: spacing['3xs'] }}>
                    Vertical
                  </label>
                  <select
                    value={selectedVertical}
                    onChange={(e) => setSelectedVertical(e.target.value)}
                    disabled={loadingVerticals}
                    style={{ padding: spacing.xs, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm, minWidth: 200, backgroundColor: 'white' }}
                  >
                    <option value="all">All Verticals</option>
                    {verticals.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                  {loadingVerticals && (
                    <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginLeft: spacing.xs }}>Loading...</span>
                  )}
                </div>
              )}

              <div>
                <label style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, display: 'block', marginBottom: spacing['3xs'] }}>From</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  style={{ padding: spacing.xs, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }} />
              </div>
              <div>
                <label style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, display: 'block', marginBottom: spacing['3xs'] }}>To</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  style={{ padding: spacing.xs, border: `1px solid ${colors.border}`, borderRadius: radius.sm, fontSize: typography.sizes.sm }} />
              </div>

              <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'flex-end' }}>
                {[{ label: 'Last 7 days', days: 7 }, { label: 'Last 30 days', months: 1 }, { label: 'Last 90 days', months: 3 }].map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      const d = new Date()
                      if (preset.days) d.setDate(d.getDate() - preset.days)
                      else d.setMonth(d.getMonth() - (preset.months || 0))
                      setDateFrom(d.toISOString().split('T')[0])
                      setDateTo(new Date().toISOString().split('T')[0])
                    }}
                    style={quickSelectStyle}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Selection Controls */}
          <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>Quick select:</span>
            <button onClick={selectAll} style={quickSelectStyle}>All</button>
            <button onClick={selectNone} style={quickSelectStyle}>None</button>
            <span style={{ color: colors.border }}>|</span>
            {Object.entries(modeCategories).map(([cat, { label }]) => (
              <button key={cat} onClick={() => selectCategory(cat)} style={quickSelectStyle}>{label}</button>
            ))}
          </div>

          {/* Reports by Category */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginBottom: spacing.lg }}>
            {Object.entries(reportsByCategory).map(([category, reports]) => {
              const catInfo = CATEGORY_LABELS[category]
              return (
                <div key={category} style={{ backgroundColor: colors.surfaceElevated, borderRadius: radius.md, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
                  <div style={{ backgroundColor: catInfo.color + '15', borderBottom: `2px solid ${catInfo.color}`, padding: `${spacing.sm} ${spacing.md}` }}>
                    <h3 style={{ margin: 0, fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: catInfo.color }}>
                      {catInfo.label}
                    </h3>
                  </div>
                  <div style={{ padding: spacing.sm }}>
                    {reports.map(report => (
                      <label
                        key={report.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: spacing.sm,
                          padding: spacing.sm,
                          cursor: 'pointer',
                          borderRadius: radius.sm,
                          backgroundColor: selectedReports.has(report.id) ? catInfo.color + '10' : 'transparent',
                          border: selectedReports.has(report.id) ? `1px solid ${catInfo.color}40` : '1px solid transparent',
                          marginBottom: spacing['2xs']
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedReports.has(report.id)}
                          onChange={() => toggleReport(report.id)}
                          style={{ marginTop: 3, width: 18, height: 18, accentColor: catInfo.color }}
                        />
                        <div>
                          <div style={{ fontWeight: typography.weights.medium, color: colors.textPrimary, fontSize: typography.sizes.sm }}>
                            {report.name}
                          </div>
                          <div style={{ fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: spacing['3xs'] }}>
                            {report.description}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Run Button & Progress */}
          <div style={{ position: 'sticky', bottom: 0, backgroundColor: colors.surfaceBase, padding: `${spacing.md} 0`, borderTop: `1px solid ${colors.border}`, marginTop: spacing.lg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
              <button
                onClick={runReports}
                disabled={running || selectedReports.size === 0}
                style={{
                  padding: `${spacing.sm} ${spacing.xl}`,
                  backgroundColor: running || selectedReports.size === 0 ? colors.textMuted : colors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: radius.md,
                  fontSize: typography.sizes.base,
                  fontWeight: typography.weights.semibold,
                  cursor: running || selectedReports.size === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.xs
                }}
              >
                {running ? 'Running...' : `Run ${selectedReports.size} Report${selectedReports.size !== 1 ? 's' : ''}`}
              </button>
              {selectedReports.size > 0 && !running && (
                <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>
                  {selectedReports.size} report{selectedReports.size !== 1 ? 's' : ''} selected
                </span>
              )}
            </div>

            {progress.length > 0 && (
              <div style={{ marginTop: spacing.md, padding: spacing.sm, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, fontFamily: 'monospace', fontSize: typography.sizes.xs, maxHeight: 150, overflowY: 'auto' }}>
                {progress.map((line, i) => (
                  <div key={i} style={{
                    color: line.includes('Error') ? '#dc2626' :
                           line.includes('Downloaded') ? '#10b981' :
                           line.includes('complete') ? '#3b82f6' :
                           colors.textSecondary
                  }}>
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── QUALITY CHECKS (vertical mode only) ─────────────────── */}
      {!isPlatform && activeTab === 'quality' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md, flexWrap: 'wrap', gap: spacing.sm }}>
            <p style={{ color: colors.textSecondary, margin: 0 }}>
              Nightly vendor data quality scans. Checks run at 4am CT. Vendors are notified of findings.
            </p>
            <button
              onClick={runQualityChecks}
              disabled={qcRunning}
              style={{ padding: `${spacing.xs} ${spacing.md}`, backgroundColor: qcRunning ? colors.textMuted : colors.primary, color: 'white', border: 'none', borderRadius: radius.md, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, cursor: qcRunning ? 'wait' : 'pointer', minHeight: 40, whiteSpace: 'nowrap' }}
            >
              {qcRunning ? 'Running Scan...' : 'Run Now'}
            </button>
          </div>

          {qcLoading ? (
            <p style={{ color: colors.textMuted, textAlign: 'center', padding: spacing.xl }}>Loading...</p>
          ) : (
            <>
              {qcSummary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: spacing.sm, marginBottom: spacing.lg }}>
                  <SummaryCard
                    label="Total Active"
                    value={qcSummary.totalActive}
                    color={qcSummary.totalActive > 0 ? statusColors.warning : statusColors.success}
                  />
                  {Object.entries(qcSummary.byCheck).map(([check, count]) => (
                    <SummaryCard key={check} label={CHECK_LABELS[check] || check} value={count} color={statusColors.neutral600} />
                  ))}
                </div>
              )}

              {/* Scan History */}
              <div style={{ backgroundColor: colors.surfaceElevated, borderRadius: radius.md, border: `1px solid ${colors.border}`, marginBottom: spacing.lg, overflow: 'hidden' }}>
                <div style={{ padding: `${spacing.sm} ${spacing.md}`, borderBottom: `1px solid ${colors.border}`, backgroundColor: statusColors.neutral50 }}>
                  <h3 style={{ margin: 0, fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>Scan History</h3>
                </div>
                {scanHistory.length === 0 ? (
                  <p style={{ padding: spacing.md, color: colors.textMuted, margin: 0 }}>No scans have been run yet.</p>
                ) : (
                  <div className="admin-table-wrap">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.sizes.sm }}>
                      <thead>
                        <tr style={{ backgroundColor: statusColors.neutral50 }}>
                          <th style={thStyle}>Time</th>
                          <th style={thStyle}>Status</th>
                          <th style={thStyle}>Vendors</th>
                          <th style={thStyle}>Findings</th>
                          <th style={thStyle}>Breakdown</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scanHistory.slice(0, 10).map(scan => (
                          <tr key={scan.id}>
                            <td style={tdStyle}>{new Date(scan.started_at).toLocaleString()}</td>
                            <td style={tdStyle}>
                              <span style={{
                                padding: `2px ${spacing['2xs']}`,
                                borderRadius: radius.sm,
                                fontSize: typography.sizes.xs,
                                fontWeight: typography.weights.medium,
                                backgroundColor: scan.status === 'completed' ? statusColors.successLight :
                                  scan.status === 'failed' ? statusColors.dangerLight :
                                  statusColors.warningLight,
                                color: scan.status === 'completed' ? statusColors.success :
                                  scan.status === 'failed' ? statusColors.danger :
                                  statusColors.warning,
                              }}>
                                {scan.status}
                              </span>
                              {scan.error_message && (
                                <span style={{ fontSize: typography.sizes.xs, color: statusColors.danger, marginLeft: spacing['2xs'] }}>
                                  {scan.error_message.slice(0, 50)}
                                </span>
                              )}
                            </td>
                            <td style={tdStyle}>{scan.vendors_scanned}</td>
                            <td style={tdStyle}>
                              <span style={{ fontWeight: scan.findings_created > 0 ? typography.weights.semibold : typography.weights.normal }}>
                                {scan.findings_created}
                              </span>
                            </td>
                            <td style={tdStyle}>
                              {scan.findings_by_check ? (
                                <span style={{ fontSize: typography.sizes.xs, color: colors.textMuted }}>
                                  {Object.entries(scan.findings_by_check)
                                    .filter(([, v]) => v > 0)
                                    .map(([k, v]) => `${CHECK_LABELS[k] || k}: ${v}`)
                                    .join(', ') || 'none'}
                                </span>
                              ) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Active Findings */}
              <div style={{ backgroundColor: colors.surfaceElevated, borderRadius: radius.md, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
                <div style={{ padding: `${spacing.sm} ${spacing.md}`, borderBottom: `1px solid ${colors.border}`, backgroundColor: statusColors.neutral50 }}>
                  <h3 style={{ margin: 0, fontSize: typography.sizes.base, fontWeight: typography.weights.semibold, color: colors.textPrimary }}>
                    Active Findings ({findings.length})
                  </h3>
                </div>
                {findings.length === 0 ? (
                  <div style={{ padding: spacing.lg, textAlign: 'center' }}>
                    <p style={{ color: statusColors.success, fontWeight: typography.weights.semibold, margin: 0 }}>
                      All clear — no active findings.
                    </p>
                  </div>
                ) : (
                  <div className="admin-table-wrap">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.sizes.sm }}>
                      <thead>
                        <tr style={{ backgroundColor: statusColors.neutral50 }}>
                          <th style={thStyle}>Severity</th>
                          <th style={thStyle}>Vendor</th>
                          <th style={thStyle}>Check</th>
                          <th style={thStyle}>Title</th>
                          <th style={thStyle}>Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {findings.map(f => {
                          const sev = SEVERITY_STYLES[f.severity] || SEVERITY_STYLES.suggestion
                          return (
                            <tr key={f.id}>
                              <td style={tdStyle}>
                                <span style={{ padding: `2px ${spacing['2xs']}`, borderRadius: radius.sm, fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, backgroundColor: sev.bg, color: sev.color, whiteSpace: 'nowrap' }}>
                                  {sev.label}
                                </span>
                              </td>
                              <td style={{ ...tdStyle, fontWeight: typography.weights.medium, whiteSpace: 'nowrap' }}>
                                <Link href={`/${vertical}/admin/vendors/${f.vendor_profile_id}`} style={{ color: colors.primary, textDecoration: 'none' }}>
                                  {f.vendorName} →
                                </Link>
                              </td>
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{CHECK_LABELS[f.check_type] || f.check_type}</td>
                              <td style={{ ...tdStyle, fontWeight: typography.weights.medium }}>{f.title}</td>
                              <td style={{ ...tdStyle, color: colors.textSecondary, maxWidth: 400 }}>{f.message}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
      <StatusBanner />
    </div>
  )
}

// ── Shared Styles ─────────────────────────────────────────────

const quickSelectStyle = {
  padding: `${spacing['2xs']} ${spacing.sm}`,
  backgroundColor: 'transparent',
  border: `1px solid ${colors.border}`,
  borderRadius: radius.sm,
  fontSize: typography.sizes.xs,
  cursor: 'pointer',
  color: colors.textSecondary
}

const thStyle: React.CSSProperties = {
  padding: `${spacing.xs} ${spacing.sm}`,
  textAlign: 'left',
  fontWeight: typography.weights.semibold,
  color: statusColors.neutral600,
  borderBottom: `1px solid ${colors.border}`,
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: `${spacing.xs} ${spacing.sm}`,
  borderBottom: `1px solid ${colors.borderMuted}`,
  verticalAlign: 'top',
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ padding: spacing.sm, backgroundColor: colors.surfaceElevated, border: `1px solid ${colors.border}`, borderRadius: radius.md, textAlign: 'center', boxShadow: shadows.sm }}>
      <div style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color }}>{value}</div>
      <div style={{ fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: spacing['3xs'] }}>{label}</div>
    </div>
  )
}
