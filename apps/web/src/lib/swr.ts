import type { SWRConfiguration } from 'swr'

/**
 * Default fetcher for SWR — JSON fetch with error handling.
 * Usage: const { data, error } = useSWR('/api/endpoint', fetcher)
 */
export const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) {
    const error = new Error('API request failed')
    const body = await res.json().catch(() => ({}))
    ;(error as any).status = res.status
    ;(error as any).info = body
    throw error
  }
  return res.json()
}

/**
 * SWR defaults for the app.
 * - revalidateOnFocus: refresh when user returns to tab
 * - dedupingInterval: avoid duplicate requests within 5s
 * - errorRetryCount: retry failed requests up to 3 times
 */
export const swrDefaults: SWRConfiguration = {
  fetcher,
  revalidateOnFocus: true,
  dedupingInterval: 5000,
  errorRetryCount: 3,
}
