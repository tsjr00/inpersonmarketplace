import {
  Package, PackageCheck, Calendar, MapPin, Tent, Receipt, ClipboardList,
  ShoppingBasket, Store, Truck, BarChart3, Star, Heart, Search,
  LayoutDashboard, FilePlus, Shield, Sparkles, Bell, MessageSquare,
  type LucideIcon,
} from 'lucide-react'

/**
 * THE DASHBOARD ICON VOCABULARY — every icon choice in one reviewable place.
 *
 * Why lucide and not emoji (owner decision, 2026-08-07): emoji are drawn
 * differently by Apple, Google and Microsoft, so "consistent style and colour"
 * is literally unachievable with them — and most of our users are on phones
 * across mixed platforms. Lucide gives one stroke weight, one colour, and the
 * same picture on every device. `lucide-react` was already a dependency (7
 * landing-page components use it), so this added nothing to the bundle story.
 *
 * The set replaces emoji that had drifted off-motif — the worst being a booth
 * rendered as 🪑 an office chair. A booth is a market stall, so it is `Store`.
 *
 * ⚠ TO CHANGE AN ICON, EDIT THIS MAP — never pass a raw lucide component at a
 * call site. The whole point is that the vocabulary stays reviewable as a set
 * rather than drifting one dashboard at a time, which is exactly how the emoji
 * ended up mismatched.
 *
 * Vertical theming comes free through colour: DashboardTile paints icons with
 * `colors.primary`, which is a CSS variable swapped per vertical. Icon CHOICE is
 * already vertical-specific where it matters — `booth` is FM-only, `park` is
 * FT-only — so no per-vertical mapping machinery is needed.
 */
export const DASHBOARD_ICONS = {
  // --- vendor dashboard ---
  pickup: Package,              // pickup mode — market-day fulfillment
  upcoming: Calendar,           // upcoming pickups
  locations: MapPin,            // manage locations
  events: Tent,                 // event marquee (was 🎪 circus tent)
  orders: Receipt,
  listings: ClipboardList,      // was 📋
  marketBoxes: ShoppingBasket,  // was 📦 — a box of produce, not a shipping carton
  booth: Store,                 // FM market stall (was 🪑 an office chair)
  park: Truck,                  // FT park spot (was 🅿️ a parking sign)
  analytics: BarChart3,
  reviews: Star,

  // --- shopper dashboard ---
  browse: Search,
  readyForPickup: PackageCheck,
  favorites: Heart,
  whereToday: MapPin,           // deliberately the same glyph as `locations` —
                                // it is the same idea seen from the buyer side
  vendorDashboard: LayoutDashboard,
  createDrafts: FilePlus,
  adminPanel: Shield,
  upgrade: Sparkles,
  notifications: Bell,
  feedback: MessageSquare,
} satisfies Record<string, LucideIcon>

export type DashboardIconName = keyof typeof DASHBOARD_ICONS

/** Size and weight for a tile's icon. One value, so the grid scans evenly. */
export const ICON_SIZE = 28
export const ICON_STROKE = 1.75
