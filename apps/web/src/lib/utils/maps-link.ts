/**
 * Build a Google Maps URL from address components.
 * Works universally: iOS opens Apple Maps (or Google Maps if installed),
 * Android opens Google Maps, desktop opens in browser.
 */
export function getMapsUrl(...parts: (string | null | undefined)[]): string {
  const query = parts.filter(Boolean).join(', ')
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`
}
