'use client'

import { useReportWebVitals } from 'next/web-vitals'

/**
 * Web Vitals reporting component.
 * Captures CLS, FID, FCP, LCP, TTFB and logs them.
 * Include this component once in the root layout.
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    // In production, send to analytics endpoint
    if (process.env.NODE_ENV === 'production') {
      // Send to /api/analytics/vitals if/when that endpoint exists
      // For now, use navigator.sendBeacon for fire-and-forget
      const body = JSON.stringify({
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
        delta: metric.delta,
        id: metric.id,
      })

      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/analytics/vitals', body)
      }
    }
  })

  return null
}
