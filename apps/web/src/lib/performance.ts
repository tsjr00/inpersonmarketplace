/**
 * Simple performance tracking for admin operations
 * Stores metrics in memory (resets on server restart)
 * For production, replace with a proper metrics service
 */

interface MetricEntry {
  name: string
  duration: number
  timestamp: Date
  metadata?: Record<string, unknown>
}

interface AggregatedMetric {
  name: string
  count: number
  avgDuration: number
  minDuration: number
  maxDuration: number
  p95Duration: number
  lastHour: number
}

// In-memory storage (per serverless instance)
const metrics: MetricEntry[] = []
const MAX_ENTRIES = 10000 // Prevent memory bloat

/**
 * Track a metric (typically a query or operation duration)
 */
export function trackMetric(
  name: string,
  duration: number,
  metadata?: Record<string, unknown>
) {
  // Add new entry
  metrics.push({
    name,
    duration,
    timestamp: new Date(),
    metadata
  })

  // Prune old entries if over limit
  if (metrics.length > MAX_ENTRIES) {
    metrics.splice(0, metrics.length - MAX_ENTRIES)
  }
}

/**
 * Helper to time an async operation and track it
 */
export async function trackAsync<T>(
  name: string,
  operation: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const start = performance.now()
  try {
    const result = await operation()
    const duration = performance.now() - start
    trackMetric(name, duration, metadata)
    return result
  } catch (error) {
    const duration = performance.now() - start
    trackMetric(name, duration, { ...metadata, error: true })
    throw error
  }
}

/**
 * Get aggregated metrics for reporting
 */
export function getMetricsSummary(since?: Date): AggregatedMetric[] {
  const cutoff = since || new Date(Date.now() - 24 * 60 * 60 * 1000) // Default: last 24 hours
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000)

  const filtered = metrics.filter(m => m.timestamp >= cutoff)

  // Group by name
  const groups = new Map<string, MetricEntry[]>()
  for (const entry of filtered) {
    const existing = groups.get(entry.name) || []
    existing.push(entry)
    groups.set(entry.name, existing)
  }

  // Calculate aggregates
  const results: AggregatedMetric[] = []
  for (const [name, entries] of groups) {
    const durations = entries.map(e => e.duration).sort((a, b) => a - b)
    const lastHourEntries = entries.filter(e => e.timestamp >= hourAgo)

    results.push({
      name,
      count: entries.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      p95Duration: durations[Math.floor(durations.length * 0.95)] || durations[durations.length - 1],
      lastHour: lastHourEntries.length
    })
  }

  // Sort by count descending
  return results.sort((a, b) => b.count - a.count)
}

/**
 * Get raw metrics (for detailed analysis)
 */
export function getRawMetrics(name?: string, limit = 100): MetricEntry[] {
  const filtered = name ? metrics.filter(m => m.name === name) : metrics
  return filtered.slice(-limit).reverse() // Most recent first
}

/**
 * Clear all metrics (useful for testing)
 */
export function clearMetrics() {
  metrics.length = 0
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}
