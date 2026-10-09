'use client'

import { useEffect } from 'react'

/**
 * Staging-only icon-set override (owner 2026-10-09: keep the library icons as
 * a backup and add the new ones "so we can see how they look").
 *
 * `?icons=library` or `?icons=custom` on any page under the vertical sets
 * `data-icon-set` on the layout wrapper for the rest of the browser session,
 * overriding the committed switch (custom-icons.ts DASHBOARD_ICON_SET) so the
 * two sets can be compared side by side on staging. `?icons=default` clears it.
 *
 * The [vertical] layout renders this component ONLY when VERCEL_ENV is not
 * 'production' — production never mounts it, so the override cannot apply
 * there by construction (same pattern as the tax rehearsal switch).
 */
const KEY = 'dash-icon-set-override'

export default function IconSetOverride() {
  useEffect(() => {
    try {
      const param = new URLSearchParams(window.location.search).get('icons')
      if (param === 'library' || param === 'custom') sessionStorage.setItem(KEY, param)
      else if (param === 'default') sessionStorage.removeItem(KEY)
      const chosen = sessionStorage.getItem(KEY)
      if (chosen !== 'library' && chosen !== 'custom') return
      const wrapper = document.querySelector<HTMLElement>('[data-icon-set]')
      if (wrapper) wrapper.dataset.iconSet = chosen
    } catch {
      // Private mode or blocked storage — the committed switch stands.
    }
  })
  return null
}
