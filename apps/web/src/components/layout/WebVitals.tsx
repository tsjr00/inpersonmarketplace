'use client'

import { useReportWebVitals } from 'next/web-vitals'

/**
 * Web Vitals reporting component.
 * Captures CLS, FID, FCP, LCP, TTFB and logs them.
 * Include this component once in the root layout.
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    // No-op until NEXT_PUBLIC_VITALS_ENDPOINT is configured at build time.
    const endpoint = process.env.NEXT_PUBLIC_VITALS_ENDPOINT
    if (!endpoint) return
    if (process.env.NODE_ENV !== 'production') return
    if (!navigator.sendBeacon) return

    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      id: metric.id,
    })

    navigator.sendBeacon(endpoint, body)
  })

  return null
}
