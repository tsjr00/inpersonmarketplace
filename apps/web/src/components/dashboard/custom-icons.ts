/**
 * THE CUSTOM ICON OVERLAY — the owner's drawn icon set, laid over the lucide
 * vocabulary in ./icons.tsx without replacing it (owner 2026-10-09: "keep the
 * library icons we have now as a backup and then add the new ones so we can
 * see how they look").
 *
 * How it fits:
 *  - ./icons.tsx stays the complete vocabulary (every name resolves to a lucide
 *    component). Nothing is removed from it.
 *  - This file names the SUBSET the drawn set covers, per vertical, with a
 *    full-size file and a small-size file for each. Names not listed here keep
 *    their lucide glyph whatever the switch says.
 *  - Files live in public/icons/custom/ (192 px, black on transparent). They
 *    are painted in the app's colour through a CSS mask (CustomIcon in
 *    ./DashboardIcon.tsx), so the vertical brand colour, the locked grey and
 *    the active-tab colour all still apply. What a PNG cannot do is change its
 *    line thickness on the active tab the way a lucide stroke can.
 *  - Which set renders is ONE switch (DASHBOARD_ICON_SET). On a non-production
 *    deployment `?icons=library` / `?icons=custom` on a dashboard URL overrides
 *    it for that visit so the two can be compared side by side; production
 *    ignores the override (IconSetOverride.tsx).
 *  - The vertical is not known inside the tile and nav components (server
 *    components, no params), so the per-vertical FILE choice is made where the
 *    vertical IS known — the [vertical] layout — as CSS variables
 *    (customIconCssVars); the components only reference the variable by name.
 *
 * Sources + review sheet: `icons etc/final/` at the repo root (1024 px masters).
 * Spec documents: `icons etc/*.md` (to be rewritten to the kept style).
 */
import type { DashboardIconName } from './icons'

/** Which set the dashboards draw. Flip to 'library' to go back in one commit. */
export const DASHBOARD_ICON_SET: 'custom' | 'library' = 'custom'

/** Tile icon size for the DRAWN set. 28 = the lucide size (use small files); ~44 shows the full drawings. */
export const CUSTOM_TILE_ICON_SIZE = 44

type Vertical = 'farmers_market' | 'food_trucks'
interface CustomIconFiles { full: string; small: string }

const F = (full: string, small: string = full): CustomIconFiles => ({ full: `/icons/custom/${full}.png`, small: `/icons/custom/${small}.png` })

/**
 * The drawn set, by dashboard icon name and vertical. A name missing here, or a
 * vertical missing under a name, falls back to lucide for that case.
 */
export const CUSTOM_ICONS: Partial<Record<DashboardIconName, Partial<Record<Vertical, CustomIconFiles>>>> = {
  park: { food_trucks: F('FoodTruckPark_Icon', 'FoodTruckPark_Icon_Small') },
  booth: { farmers_market: F('MarketBooth_Icon') },
  locations: {
    food_trucks: F('FoodTruck_Location_Icon', 'FoodTruck_Location_Icon_Small'),
    farmers_market: F('FarmersMarket_Location_Icon', 'FarmersMarket_Location_Icon_Small'),
  },
  whereToday: {
    food_trucks: F('FoodTruck_Location_Icon', 'FoodTruck_Location_Icon_Small'),
    farmers_market: F('FarmersMarket_Location_Icon', 'FarmersMarket_Location_Icon_Small'),
  },
  listings: {
    food_trucks: F('FoodTruck_Menu_Icon', 'FoodTruck_Menu_Icon_Small'),
    farmers_market: F('Market_ProductListings_Icon', 'Market_ProductListings_Icon_Small'),
  },
  vendorDashboard: {
    food_trucks: F('FoodTruck_Vendor_Icon'),
    farmers_market: F('Market_Vendor_Icon'),
  },
  events: {
    food_trucks: F('FoodTruck_Event_Icon'),
    farmers_market: F('FarmersMarket_Event_Icon'),
  },
}

/** The CSS variable a component references for a name (full or small). */
export function customIconVar(name: DashboardIconName, variant: 'full' | 'small'): string {
  return `--dash-icon-${name}-${variant}`
}

/**
 * Per-vertical CSS variables for every drawn icon — emitted once by the
 * [vertical] layout on the same wrapper that carries the colour variables.
 * A name the vertical has no drawing for gets NO variable, and CustomIcon
 * then falls back to lucide (it checks `hasCustomIcon`).
 */
export function customIconCssVars(vertical: string): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [name, byVertical] of Object.entries(CUSTOM_ICONS)) {
    const files = byVertical?.[vertical as Vertical]
    if (!files) continue
    vars[customIconVar(name as DashboardIconName, 'full')] = `url("${files.full}")`
    vars[customIconVar(name as DashboardIconName, 'small')] = `url("${files.small}")`
    // Presence flags DashboardIcon reads as `display` values: the drawing shows,
    // the lucide glyph hides — only for the names THIS vertical has a file for.
    vars[`--dash-icon-${name}-has`] = 'inline-block'
    vars[`--dash-icon-${name}-lib`] = 'none'
  }
  return vars
}

/** True when EVERY vertical the app serves has a drawing for this name (so the component can rely on the variable). */
export function hasCustomIcon(name: DashboardIconName): boolean {
  const byVertical = CUSTOM_ICONS[name]
  if (!byVertical) return false
  return VERTICALS.every((v) => !!byVertical[v])
}

/** Names drawn for ONE vertical only — rendered custom there, lucide elsewhere (decided by the variable's presence). */
export function hasCustomIconFor(name: DashboardIconName, vertical: string): boolean {
  return !!CUSTOM_ICONS[name]?.[vertical as Vertical]
}

const VERTICALS: Vertical[] = ['farmers_market', 'food_trucks']
