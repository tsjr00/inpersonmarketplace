import type { CSSProperties } from 'react'
import { DASHBOARD_ICONS, type DashboardIconName } from './icons'
import { customIconVar, hasCustomIcon, hasCustomIconFor } from './custom-icons'

/**
 * One dashboard icon, drawn from whichever set is active (custom-icons.ts).
 *
 * Server-safe: no hooks, no vertical prop. BOTH renderings are emitted —
 * the lucide glyph and the drawn icon — and CSS decides which one shows:
 *  - the [vertical] layout sets `--dash-icon-<name>-has` / `-lib` for the
 *    names the vertical has a drawing for, so a name with no drawing on this
 *    vertical shows lucide and never a blank masked square;
 *  - the wrapper's `data-icon-set` (the switch, or the staging override)
 *    flips between the two with the rules in globals.css.
 * The drawn icon is a CSS mask filled with `currentColor`, so it takes the
 * same colour the lucide glyph would (brand primary, locked grey, active tab).
 *
 * `customSize` lets a tile show the full drawing larger than the 28 px lucide
 * glyph (CUSTOM_TILE_ICON_SIZE); the nav bar passes the same size for both.
 */
export default function DashboardIcon({
  name,
  size,
  customSize = size,
  variant = 'full',
  strokeWidth,
  className,
}: {
  name: DashboardIconName
  size: number
  customSize?: number
  variant?: 'full' | 'small'
  strokeWidth?: number
  className?: string
}) {
  const Icon = DASHBOARD_ICONS[name]
  // A name drawn for neither vertical renders lucide only — no second element.
  const drawn = hasCustomIcon(name) || hasCustomIconFor(name, 'farmers_market') || hasCustomIconFor(name, 'food_trucks')
  const url = `var(${customIconVar(name, variant)})`
  const customStyle: CSSProperties = {
    display: `var(--dash-icon-${name}-has, none)`,
    width: customSize,
    height: customSize,
    backgroundColor: 'currentColor',
    WebkitMaskImage: url,
    maskImage: url,
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    verticalAlign: 'middle',
  }
  return (
    <span className={`dash-icon ${className ?? ''}`} style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}>
      <Icon
        className="dash-icon-library"
        size={size}
        strokeWidth={strokeWidth}
        aria-hidden
        style={drawn ? { display: `var(--dash-icon-${name}-lib, inline-block)` } : undefined}
      />
      {drawn && <span className="dash-icon-custom" aria-hidden style={customStyle} />}
    </span>
  )
}
