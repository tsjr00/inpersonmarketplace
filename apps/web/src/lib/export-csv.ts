/**
 * Export data to CSV file and trigger download
 *
 * @param data - Array of objects to export
 * @param filename - Name for the downloaded file (without .csv)
 * @param columns - Optional column configuration for headers and value extraction
 */
export function exportToCSV<T>(
  data: T[],
  filename: string,
  columns?: { key: keyof T | string; header: string; getValue?: (row: T) => string | number }[]
) {
  if (data.length === 0) {
    alert('No data to export')
    return
  }

  // Determine columns from config or auto-detect from first row
  type ColumnConfig = { key: keyof T | string; header: string; getValue?: (row: T) => string | number }
  const cols: ColumnConfig[] = columns || Object.keys(data[0] as object).map(key => ({
    key,
    header: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }))

  // Build CSV content
  const headers = cols.map(c => `"${c.header}"`).join(',')

  const rows = data.map(row => {
    return cols.map(col => {
      let value: unknown

      if (col.getValue) {
        value = col.getValue(row)
      } else if (typeof col.key === 'string' && col.key.includes('.')) {
        // Handle nested keys like "vendor_profiles.tier"
        const keys = col.key.split('.')
        value = keys.reduce((obj: unknown, key) => {
          if (obj && typeof obj === 'object' && key in obj) {
            return (obj as Record<string, unknown>)[key]
          }
          return undefined
        }, row)
      } else {
        value = row[col.key as keyof T]
      }

      // Format value for CSV
      if (value === null || value === undefined) {
        return '""'
      }

      if (typeof value === 'object') {
        // JSON stringify objects
        return `"${JSON.stringify(value).replace(/"/g, '""')}"`
      }

      // Escape quotes and wrap in quotes
      return `"${String(value).replace(/"/g, '""')}"`
    }).join(',')
  })

  const csv = [headers, ...rows].join('\n')

  // Create blob and trigger download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`)
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

/**
 * Format a date for CSV export
 */
export function formatDateForExport(date: string | Date | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}

/**
 * Format currency cents to dollars for CSV export
 */
export function formatCentsForExport(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  return (cents / 100).toFixed(2)
}
