# Custom icon set — findings, options, AI instructions (2026-10-04 · parked 2026-10-08 · BUILT 2026-10-09)

## ▶ STATUS 2026-10-09 — option A built as an OVERLAY (owner: keep the library icons as backup, add the new ones to see how they look)
- Files: `icons etc/final/` = 19 masters (10 originals centred + renamed, 6 small versions, Manager, 2 event icons) + review sheet; app copies at `apps/web/public/icons/custom/` (192 px, 159 KB total). The AI's third delivery (`100926 - 3`) was byte-identical to its second — nothing new.
- Code: `components/dashboard/custom-icons.ts` (table per vertical, `DASHBOARD_ICON_SET='custom'`, `CUSTOM_TILE_ICON_SIZE=44`), `DashboardIcon.tsx` (both renderings, CSS mask in currentColor), `IconSetOverride.tsx` (staging `?icons=library|custom|default`), layout emits the per-vertical variables + `data-icon-set`, globals.css rules. 6 unit specs. TR-146 / printable W6 step 9.
- Round 4 (`100926 - 4`, 2026-10-09 15:04) delivered the five owed files (one duplicate with a badge dropped): Manager_Icon_Small · FoodTruck_EventManager_Icon · FarmersMarket_EventManager_Icon (long-haired figure, matches Market_Vendor) · FarmersMarket_Event_Icon_Small · FoodTruck_Event_Icon_Small. `final/` = 24 masters; app copies 24. NOTHING is owed from the AI now.
- Nav names added (`icons.tsx`): `manager` (lucide UserCog fallback) and `eventManager` (CalendarCheck fallback); `nav-destinations.ts` uses them for the Markets and Events destinations; the overlay maps both per vertical. Events small versions now the dedicated files.
- NEXT after the owner looks on staging: tile size ruling (28 + small vs 44 + full) · map Manager_Icon to a nav name · rewrite the 4 spec docs to the kept style · event pages / landing / empty states.


Owner: "I had an AI create these from my instructions … I like these a lot more than the icons we currently
have." Files: repo root `icons etc/` (11 PNGs + 1 screenshot + 4 spec docs, all dated 2026-09-08).
**Owner has NOT chosen an option yet** (A / B / C below). Parked 2026-10-08 for something more pressing.

## How the app draws icons today (read in full 2026-10-04)
- ONE map: `src/components/dashboard/icons.tsx` — 21 named icons, all `lucide-react` components, typed
  `satisfies Record<string, LucideIcon>` (a picture file cannot go in without changing the type). Owner
  decision 2026-08-07 recorded in the file: lucide, not emoji; one reviewable vocabulary.
- Drawn at 28 px / stroke 1.75 on tiles (`DashboardTile.tsx:98`, `ICON_SIZE`), 20 px in the phone bottom bar
  and 18 px in the desktop rail, with stroke 2.25 when active (`DashboardNav.tsx:120,183`).
- Colour = `colors.primary` CSS variable per vertical; grey when a tile is locked (`DashboardTile.tsx:78`).
- No per-vertical icon choice exists (`icons.tsx:27-29` says none was needed). The new set is vertical-specific.
- Consumers: `DashboardTile`, `DashboardNav`, `nav-destinations.ts`, `AdminHubZones.tsx:30-62` (queue + browse
  maps). No tests on the map. Lucide also used by 7 landing components. Emoji still in ~240 files elsewhere.
- Home-screen app icons (`public/icons/*`, manifest + apple-touch-icon routes) and `/logos/*` are separate.

## The files (measured with sharp)
| File | Size | Background | Ink |
|---|---|---|---|
| Food truck.png | 1536×1024 | transparent (32 % semi) | near-black |
| Farmers Market Booth.png | 1536×1024 | transparent (23 % semi) | near-black |
| FoodTruck.png (same drawing as Food truck.png) | 757×477 | WHITE | near-black |
| FoodTruck Menu.png | 630×591 | WHITE | black |
| FoodTruck Location.png | 507×536 | WHITE | near-black |
| FoodTruck Park.png | 835×600 | WHITE | NAVY |
| FT Vendor.png | 591×477 | WHITE | near-black |
| Farmers Market.png | 776×602 | WHITE | NAVY |
| FarmersMarket Manu.png (typo) | 738×603 | WHITE | black |
| FM Vendor.png | 589×502 | WHITE | near-black |
| Market - Park Manager.png | 597×599 | WHITE | NAVY, fine lines |
| Screenshot 2026-09-08 200652.png = the booth | 573×556 | off-white | — |

Problems for the app: 9/11 white backgrounds · baked colour (3 navy, rest black shades) · non-square, mixed
sizes · line weight differs (menus + truck heavy; park/market/manager fine) · busy scenes lose detail at 20–28 px
(sheet rendered at 20/28/48/96 px — owner to judge) · 117 KB–1.2 MB each, 3.9 MB set · duplicates · spaces in names.

Departures from the owner's own specs (style, not technical): striped/scalloped awnings · burger/taco/drink +
mini truck in the FT menu · clipboard + food-only markers on the FM listing · one combined manager with cap, badge,
clipboard · gendered vendor figures (spec: one neutral figure) · pin floats above the truck · picnic tables, string
lights, four booths · the four EVENT icons are missing.

## Options presented 2026-10-08 (owner has not chosen)
**A (recommended) — keep these drawings, fix only the technical side.** AI redoes each file (instructions below);
app: extend the icon map to accept these next to lucide + choose per vertical; lucide stays for orders/analytics/
bell etc. Loses: the active-tab thicker stroke (background + accent bar stay). Update the spec docs to bless the
style the owner likes.
**B — AI redraws everything to the current written spec.** Tighter pictograms; loses the look the owner likes.
**C — Claude cleans up the existing PNGs** (white → transparent, square, one colour; NOT tried yet). Cannot fix line
weight or small-size detail → large uses only (headers, landing).
All three: the busy scenes won't read at 18–20 px → keep a simpler icon there or get `_Small` variants.

## Instructions for the AI (option A)
```
Redo each attached icon keeping the SAME drawing and style. Change only these things:
1. Canvas: exactly 1024 x 1024 px, square.
2. Background: fully transparent. No white, no off-white, no shadow, no halo.
3. Colour: pure black (#000000) lines only. No navy, no grey, no second colour. The app will colour the icon itself.
4. Line thickness: identical on every icon in the set. Use the single food truck icon as the master and match it
   everywhere, including small interior details.
5. Line ends and corners: rounded, as now.
6. Fills: outline only. No solid filled areas except tiny dots.
7. Padding: about 10% empty space on every side. Centre the drawing.
8. Edges: clean and crisp. No blur, no soft glow.
9. Output: PNG with transparency. If you can also produce a true vector SVG with strokes set to "currentColor",
   provide that too.
10. File names, no spaces: FoodTruck_Icon, FoodTruck_Menu_Icon, FoodTruck_Location_Icon, FoodTruckPark_Icon,
    FoodTruck_Vendor_Icon, MarketBooth_Icon, FarmersMarket_Location_Icon, Market_ProductListings_Icon,
    Market_Vendor_Icon, Manager_Icon.
Also produce a SMALL version of these five, for use at 20-28 px: FoodTruck_Menu, Market_ProductListings,
FoodTruckPark, FarmersMarket_Location, Manager. Same style and line thickness, but keep only the two or three
largest shapes and remove small interior detail (string lights, picnic table, item pictures, checklist marks).
Name them with _Small at the end.
Show all icons together on one sheet at 96 px and at 24 px so the set can be checked for matching line thickness.
```
Optional spec-alignment items (owner's taste, add if wanted): one neutral person shape for all people icons ·
separate market-manager and park-manager icons · truck INSIDE the location pin · the four event icons.

## App-side work when files arrive (not designed yet)
Extend `icons.tsx` to accept an image/SVG entry per vertical; the three renderers draw it painted in
`colors.primary` (method to choose + test: inline SVG with currentColor if SVGs arrive; CSS mask over a
transparent PNG otherwise — untried); decide tile icon size (28 px may be too small for the scenes); per-vertical
mapping; keep lucide for uncovered concepts. Then rewrite the four spec docs to match the chosen style.
