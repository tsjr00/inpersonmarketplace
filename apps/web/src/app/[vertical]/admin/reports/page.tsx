'use client'

import { useState } from 'react'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

interface ReportOption {
  id: string
  name: string
  description: string
  category: 'sales' | 'operations' | 'vendors' | 'customers' | 'inventory'
}

const AVAILABLE_REPORTS: ReportOption[] = [
  // Sales & Revenue
  {
    id: 'sales_summary',
    name: 'Sales Summary',
    description: 'Total orders, revenue, avg order value, breakdown by market and time period',
    category: 'sales'
  },
  {
    id: 'revenue_fees',
    name: 'Revenue & Platform Fees',
    description: 'Gross sales, platform fees collected, vendor payouts, net platform revenue',
    category: 'sales'
  },
  {
    id: 'sales_by_category',
    name: 'Sales by Category',
    description: 'Revenue and order count broken down by product category',
    category: 'sales'
  },

  // Operations
  {
    id: 'order_details',
    name: 'Order Details',
    description: 'All orders with line items, customer, vendor, market, status, timestamps',
    category: 'operations'
  },
  {
    id: 'order_status',
    name: 'Order Status Summary',
    description: 'Orders grouped by status with counts and percentages',
    category: 'operations'
  },
  {
    id: 'cancellations',
    name: 'Cancellations & Refunds',
    description: 'Cancelled orders/items, reasons, who cancelled, refund amounts',
    category: 'operations'
  },
  {
    id: 'market_performance',
    name: 'Market Performance',
    description: 'Each market\'s order count, revenue, unique customers, unique vendors',
    category: 'operations'
  },

  // Vendors
  {
    id: 'vendor_performance',
    name: 'Vendor Performance',
    description: 'Sales, order count, avg fulfillment time, cancellation rate per vendor',
    category: 'vendors'
  },
  {
    id: 'vendor_payouts',
    name: 'Vendor Payouts',
    description: 'Payout details: gross sales, platform fees, net payout, payout status',
    category: 'vendors'
  },
  {
    id: 'vendor_roster',
    name: 'Vendor Roster',
    description: 'All vendors with tier, status, contact info, markets, listing count',
    category: 'vendors'
  },

  // Customers
  {
    id: 'customer_summary',
    name: 'Customer Summary',
    description: 'Order count, total spent, last order date, preferred market per customer',
    category: 'customers'
  },
  {
    id: 'top_customers',
    name: 'Top Customers',
    description: 'Highest spending customers with order history summary',
    category: 'customers'
  },
  {
    id: 'customer_retention',
    name: 'Customer Retention',
    description: 'New vs returning customers, repeat purchase rate by period',
    category: 'customers'
  },

  // Inventory
  {
    id: 'listing_inventory',
    name: 'Listing Inventory',
    description: 'All listings with status, price, vendor, category, stock availability',
    category: 'inventory'
  },
  {
    id: 'product_performance',
    name: 'Product Performance',
    description: 'Each listing\'s order count, revenue, and popularity ranking',
    category: 'inventory'
  },
]

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  sales: { label: 'Sales & Revenue', color: '#10b981' },
  operations: { label: 'Operations', color: '#3b82f6' },
  vendors: { label: 'Vendors', color: '#8b5cf6' },
  customers: { label: 'Customers', color: '#f59e0b' },
  inventory: { label: 'Inventory', color: '#ec4899' },
}

export default function AdminReportsPage() {
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set())
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<string[]>([])

  const toggleReport = (reportId: string) => {
    const newSelected = new Set(selectedReports)
    if (newSelected.has(reportId)) {
      newSelected.delete(reportId)
    } else {
      newSelected.add(reportId)
    }
    setSelectedReports(newSelected)
  }

  const selectAll = () => {
    setSelectedReports(new Set(AVAILABLE_REPORTS.map(r => r.id)))
  }

  const selectNone = () => {
    setSelectedReports(new Set())
  }

  const selectCategory = (category: string) => {
    const categoryReports = AVAILABLE_REPORTS.filter(r => r.category === category).map(r => r.id)
    const newSelected = new Set(selectedReports)
    categoryReports.forEach(id => newSelected.add(id))
    setSelectedReports(newSelected)
  }

  const runReports = async () => {
    if (selectedReports.size === 0) {
      alert('Please select at least one report to run.')
      return
    }

    setRunning(true)
    setProgress([])

    const reportIds = Array.from(selectedReports)

    for (const reportId of reportIds) {
      const report = AVAILABLE_REPORTS.find(r => r.id === reportId)
      setProgress(prev => [...prev, `Generating ${report?.name}...`])

      try {
        const response = await fetch('/api/admin/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reportId,
            dateFrom,
            dateTo
          })
        })

        if (!response.ok) {
          const error = await response.json()
          setProgress(prev => [...prev, `  Error: ${error.error || 'Failed to generate'}`])
          continue
        }

        // Get filename from header or use default
        const contentDisposition = response.headers.get('Content-Disposition')
        const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/)
        const filename = filenameMatch?.[1] || `${reportId}_${dateFrom}_${dateTo}.csv`

        // Download the CSV
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

  // Group reports by category
  const reportsByCategory = AVAILABLE_REPORTS.reduce((acc, report) => {
    if (!acc[report.category]) acc[report.category] = []
    acc[report.category].push(report)
    return acc
  }, {} as Record<string, ReportOption[]>)

  return (
    <div style={{ padding: spacing.lg, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{
        fontSize: typography.sizes['2xl'],
        fontWeight: typography.weights.bold,
        marginBottom: spacing.xs,
        color: colors.textPrimary
      }}>
        Reports
      </h1>
      <p style={{ color: colors.textSecondary, marginBottom: spacing.lg }}>
        Select reports to generate and download as CSV files for analysis in Excel or other tools.
      </p>

      {/* Date Range */}
      <div style={{
        backgroundColor: colors.surfaceElevated,
        padding: spacing.md,
        borderRadius: radius.md,
        marginBottom: spacing.lg,
        border: `1px solid ${colors.border}`
      }}>
        <h2 style={{
          fontSize: typography.sizes.base,
          fontWeight: typography.weights.semibold,
          marginBottom: spacing.sm,
          marginTop: 0,
          color: colors.textPrimary
        }}>
          Date Range
        </h2>
        <div style={{ display: 'flex', gap: spacing.md, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, display: 'block', marginBottom: spacing['3xs'] }}>
              From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{
                padding: spacing.xs,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: typography.sizes.sm, color: colors.textSecondary, display: 'block', marginBottom: spacing['3xs'] }}>
              To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{
                padding: spacing.xs,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.sm
              }}
            />
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: spacing.xs }}>
            <button
              onClick={() => {
                const d = new Date()
                d.setDate(d.getDate() - 7)
                setDateFrom(d.toISOString().split('T')[0])
                setDateTo(new Date().toISOString().split('T')[0])
              }}
              style={{
                padding: `${spacing['2xs']} ${spacing.sm}`,
                backgroundColor: colors.surfaceSubtle,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                cursor: 'pointer'
              }}
            >
              Last 7 days
            </button>
            <button
              onClick={() => {
                const d = new Date()
                d.setMonth(d.getMonth() - 1)
                setDateFrom(d.toISOString().split('T')[0])
                setDateTo(new Date().toISOString().split('T')[0])
              }}
              style={{
                padding: `${spacing['2xs']} ${spacing.sm}`,
                backgroundColor: colors.surfaceSubtle,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                cursor: 'pointer'
              }}
            >
              Last 30 days
            </button>
            <button
              onClick={() => {
                const d = new Date()
                d.setMonth(d.getMonth() - 3)
                setDateFrom(d.toISOString().split('T')[0])
                setDateTo(new Date().toISOString().split('T')[0])
              }}
              style={{
                padding: `${spacing['2xs']} ${spacing.sm}`,
                backgroundColor: colors.surfaceSubtle,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.sm,
                fontSize: typography.sizes.xs,
                cursor: 'pointer'
              }}
            >
              Last 90 days
            </button>
          </div>
        </div>
      </div>

      {/* Selection Controls */}
      <div style={{
        display: 'flex',
        gap: spacing.sm,
        marginBottom: spacing.md,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <span style={{ fontSize: typography.sizes.sm, color: colors.textSecondary }}>Quick select:</span>
        <button onClick={selectAll} style={quickSelectStyle}>All</button>
        <button onClick={selectNone} style={quickSelectStyle}>None</button>
        <span style={{ color: colors.border }}>|</span>
        {Object.entries(CATEGORY_LABELS).map(([cat, { label }]) => (
          <button key={cat} onClick={() => selectCategory(cat)} style={quickSelectStyle}>
            {label}
          </button>
        ))}
      </div>

      {/* Reports by Category */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md, marginBottom: spacing.lg }}>
        {Object.entries(reportsByCategory).map(([category, reports]) => {
          const catInfo = CATEGORY_LABELS[category]
          return (
            <div
              key={category}
              style={{
                backgroundColor: colors.surfaceElevated,
                borderRadius: radius.md,
                border: `1px solid ${colors.border}`,
                overflow: 'hidden'
              }}
            >
              <div style={{
                backgroundColor: catInfo.color + '15',
                borderBottom: `2px solid ${catInfo.color}`,
                padding: `${spacing.sm} ${spacing.md}`,
              }}>
                <h3 style={{
                  margin: 0,
                  fontSize: typography.sizes.base,
                  fontWeight: typography.weights.semibold,
                  color: catInfo.color
                }}>
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
                      style={{
                        marginTop: 3,
                        width: 18,
                        height: 18,
                        accentColor: catInfo.color
                      }}
                    />
                    <div>
                      <div style={{
                        fontWeight: typography.weights.medium,
                        color: colors.textPrimary,
                        fontSize: typography.sizes.sm
                      }}>
                        {report.name}
                      </div>
                      <div style={{
                        fontSize: typography.sizes.xs,
                        color: colors.textSecondary,
                        marginTop: spacing['3xs']
                      }}>
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
      <div style={{
        position: 'sticky',
        bottom: 0,
        backgroundColor: colors.surfaceBase,
        padding: `${spacing.md} 0`,
        borderTop: `1px solid ${colors.border}`,
        marginTop: spacing.lg
      }}>
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

        {/* Progress Log */}
        {progress.length > 0 && (
          <div style={{
            marginTop: spacing.md,
            padding: spacing.sm,
            backgroundColor: colors.surfaceMuted,
            borderRadius: radius.sm,
            fontFamily: 'monospace',
            fontSize: typography.sizes.xs,
            maxHeight: 150,
            overflowY: 'auto'
          }}>
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
    </div>
  )
}

const quickSelectStyle = {
  padding: `${spacing['2xs']} ${spacing.sm}`,
  backgroundColor: 'transparent',
  border: `1px solid ${colors.border}`,
  borderRadius: radius.sm,
  fontSize: typography.sizes.xs,
  cursor: 'pointer',
  color: colors.textSecondary
}
