# Event Agreement Opt-in — finalized content + Commit B build plan (2026-07-11)

Grounded in the pre-event vendor data (event-readiness questionnaire + matching scorer). User-approved draft; removed the "guests left with nothing / event is harmed" clause (too far). FT + FM + universal versions.

## Catalog facts (verified)
`market_optin_statement_catalog` cols: `id, category, statement, placeholders, vertical_id, sort_order` (+ NEW `event_eligible`). Categories in use: compliance, conduct, product_quality, insurance. Seed pattern: `INSERT ... ON CONFLICT (id) DO NOTHING`.

## ⚠️ Build coupling (why the seed can't ship alone)
Event statements sit in the SAME catalog as market/park statements. The existing market-manager opt-in **catalog route filters only by `vertical_id`** (NULL or match). If we seed event rows (esp. `vertical_id=NULL`) without changing that route, they'd appear in the MARKET/PARK manager picker too. So Commit B = ONE coupled unit:
1. **Migration 189:** `ALTER TABLE market_optin_statement_catalog ADD COLUMN event_eligible BOOLEAN NOT NULL DEFAULT false` (+ partial index) + seed the statements below.
2. **Market catalog/selections routes:** add `event_eligible = false` (IS NOT TRUE) filter so market/park pickers exclude event statements.
3. **Organizer event picker:** new organizer-authed catalog+selections routes filtering `event_eligible = true AND (vertical_id IS NULL OR = event.vertical_id)`, writing to `market_optin_selections` keyed to the event's market_id.
4. **Vendor acceptance:** render `MarketAgreementBlock` on `vendor/events/[marketId]/respond` (invite-accept) → record `vendor_market_agreement_acceptances` (reuse `fetchMarketOptinForVendor` + `computeAgreementVersionFromSnapshot`, idempotent 23505 — same pattern as FT/FM booking).

## FINALIZED STATEMENTS (organizer picks; accepted → snapshot into vendor's event agreement)

### Universal (vertical_id = NULL, event_eligible = true), sort 500+
- `ev-attendance` (conduct): "I commit to attend this event on its scheduled date and hours. Attendees pre-order from me specifically and the organizer builds the event around my confirmed participation."
- `ev-cancellation` (conduct): "If I must cancel, I will notify the organizer immediately so they can secure a replacement. I understand a late cancellation or no-show may bar me from future events."
- `ev-throughput` (conduct): "I will serve at least the throughput I stated in my event-readiness so pre-orders can be filled on time."
- `ev-readiness-accurate` (conduct): "My event-readiness answers — setup size, power needs, perishability, and odors — are accurate and current, and I will operate within them at this event."
- `ev-footprint` (conduct): "I will keep to the space and footprint the organizer assigns and follow their setup, power, and placement instructions."
- `ev-odor-disclose` (conduct): "I will disclose strong cooking smoke or odors to the organizer in advance and set up in the position they assign to limit the impact on guests."
- `ev-allergen` (product_quality): "I will accurately label allergens and honor the dietary accommodations the organizer specified for this event."
- `ev-menu-match` (product_quality): "What I serve will match what the organizer requested and what I listed for this event; I will not make material substitutions without approval."
- `ev-stay-policy` (conduct): "I will follow the event's stay policy (remain for the full event, or leave when sold out) as the organizer set it."
- `ev-licenses` (compliance): "My licenses and insurance, including any required Certificate of Insurance, are valid for this event's location and date."
- `ev-food-safety` (compliance): "I will follow the venue's and organizer's rules and all applicable food-safety requirements for this event."
- `ev-sales-tax` (compliance): "I am responsible for any sales tax on what I sell at this event."
- `ev-conduct` (conduct): "I will conduct myself professionally toward guests, staff, and other vendors."

### FT-specific (vertical_id = 'food_trucks', event_eligible = true), sort 520+
- `ev-ft-quiet-generator` (conduct): "At an indoor or noise-sensitive event I will use a quiet/inverter generator only, and will not run a standard generator without the organizer's written approval."
- `ev-ft-runtime` (conduct): "My equipment and fuel/runtime will cover the full duration of the event without a power interruption."

### FM-specific (vertical_id = 'farmers_market', event_eligible = true), sort 530+
- `ev-fm-power` (conduct): "I will confirm my electrical/power needs with the organizer in advance and bring my own power if the venue cannot supply it."
- `ev-fm-weather` (conduct): "For outdoor events I will bring weather-appropriate setup (shade or cover) to keep my products safe and presentable."
- `ev-fm-cooling` (compliance): "I will keep temperature-sensitive products properly cooled or shaded for the full event."

Caveats respected: no reference to `education_focused` (scored but never collected); FM readiness key reuse (`utensils_required`→samples, `seating_recommended`→weather) not referenced by these statements.

## Status
Content LOCKED (user-approved 2026-07-11). Commit B (migration 189 + coupled routes + acceptance) = NEXT SESSION with fresh context. Broadcast (Commit A) already built + gate-green, UNCOMMITTED.
