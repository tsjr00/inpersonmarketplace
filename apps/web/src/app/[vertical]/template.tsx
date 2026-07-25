'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Force scroll-to-top on navigation within the [vertical] segment.
 *
 * Tester A5/A9 (2026-07-23): links landed mid-page on browse (and other long
 * pages) — the how-it-works "Browse Items" button and several footer links.
 * Root cause was two-part: (1) `overflow-x: hidden` on <html> made a non-root
 * element the scroll container and broke Next's native scroll-to-top (fixed in
 * globals.css); (2) native browser scroll restoration (history.scrollRestoration
 * = 'auto') then re-applied a remembered browse position that Next wasn't
 * overriding on forward navigation — the landing drifted further down each
 * repeat visit.
 *
 * A `template` (unlike a `layout`) re-mounts on every navigation, so this effect
 * fires per route change and forces the top — unless the URL carries an intended
 * #anchor (#vendors, #contact, #privacy-policy), which we leave to the browser.
 *
 * Trade-off (accepted 2026-07-23): this also resets scroll on Back/Forward
 * within these pages, rather than restoring the prior position. For the
 * marketing + browse pages this is preferable to the drift bug.
 */
export default function VerticalTemplate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0)
  }, [pathname])
  return <>{children}</>
}
