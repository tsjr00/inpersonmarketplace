# Vendor Product Categories — Concept & Phased Plan

**Status:** Concept (Session 92, 2026-06-13). User-directed decisions locked below. FUTURE build — not scheduled, well clear of any current prod push.
**Goal:** Keep the platform's *selling* surface exclusive to handmade/hand-finished goods, while still capturing *booth-rental revenue* from vendors whose products aren't eligible to sell. Empower market managers as the local gatekeepers.

---

## The core principle (verified)

Selling and booth-renting are already **separate paths** in the code, so the whole policy reduces to: **add a selling gate, leave the booth-rent path open.**

| Capability | Who | Enforcement |
|---|---|---|
| **Sell** (publish listings, take orders, run market boxes) | Categories **1 & 2 only** | NEW `sell_eligible` gate at listing-publish + market-box-create |
| **Rent a booth / pay through the platform** | **All categories (1–4)** | Keep the booth flow ungated |

Verified: booth booking requires only a vendor profile + the market's booth inventory + Stripe Connect — NOT the selling-onboarding gates or approval (`src/app/[vertical]/markets/[id]/book/page.tsx:114-194`; design note at :139-142 "booth booking is an open marketplace — the vendor profile + market existence are the only association checks"). The FM prohibited-items list already nominally bans resale ("Resale items not produced by you", `src/lib/onboarding/category-requirements.ts:169`) — this formalizes + enforces it via self-declaration.

---

## The four categories (labels locked)

1. **Homemade, Handmade & Homegrown** — *sell-eligible.* Fresh produce, baked goods, home honey/salsa, sewn/crocheted items, handmade leather goods, etc.
2. **Hand-finished / Personalized** — *sell-eligible.* Store-bought base individually modified by the vendor: hand screen-printed shirts, hand embroidery, assembled-from-repurposed décor, monogrammed/customized items.
3. **Personal design + machine / mass produced** — *NOT eligible to sell.* Vendor-designed but machine/3rd-party produced: 3D-printed items, art prints not their own, screen-print runs produced by another company, custom-message signs not made by the vendor.
4. **Retail / Resale / Pre-owned** — *NOT eligible to sell.* Resale of finished goods, MLM/business-opportunity product, antiques/vintage sold as-is (flea-market appropriate).

---

## Locked decisions (user, 2026-06-13)

- **Strict cat 1 & 2 only** for selling. No lenient "mixed vendor" path.
- **Capture self-categorization at first interest**, BEFORE detailed info/onboarding. A cat-3/4 selection is told upfront they're not eligible to sell — with reinforced messaging throughout signup.
- **No retro-classification** of existing vendors (too few to matter); gate applies to new signups.
- **Booth-rent revenue approach: Option C first → Option B later** (clean additive path — same money plumbing; C's off-platform-billing tool stays permanently useful).
- **COI for cat-3/4 booth payers:** moot under Option C (they have no platform account; manager handles market insurance requirements offline). Re-decide if/when Option B is built.

---

## Phase 1 — Exclusivity gate (priority; ships independently)

The buyer-experience protection. Independent of the booth-revenue work.

- **Signup front-step**: self-categorize (the 4 categories with examples). Cat 1/2 → proceed as seller. Cat 3/4 → strict block with upfront copy ("not eligible to sell here; ask your market manager about booth space"). Placed BEFORE the detailed signup/onboarding.
- **Data**: `vendor_profiles.production_category TEXT[]` (the declared categories) + `sell_eligible BOOLEAN` (derived: all declared ∈ {cat1,cat2}). Store both; the gate is a cheap boolean read. (1 migration.)
- **Selling gate**: `sell_eligible` check at listing publish AND market-box create AND any other selling entry point. ENFORCEMENT SURFACE — must be airtight; miss one entry point and a cat-3/4 vendor slips through.
- **Opt-in clause** (manager catalog `market_optin_statement_catalog`): "I understand my products must remain in supported categories (handmade / hand-finished). If I change to unsupported product types, those listings may be removed without notice." Accepted at market join (already snapshotted in `vendor_market_agreement_acceptances`).
- **Manager onboarding messaging**: platform is built for cat 1 & 2; you may invite cat 3 & 4 vendors for BOOTH RENTAL (you keep that revenue) but they can't sell here — use judgment about which vendors you bring on to *sell*. ("Shared authority + responsibility.")

**Enforcement realism:** can't auto-detect that a "t-shirt" is hand-printed (cat 2, ok) vs 3rd-party-printed (cat 3, banned). Model is layered: vendor-level self-declaration gates selling; item-level drift policed by the clause + manager judgment + admin spot-check + delete-without-warning. Don't promise per-item automation.

## Phase 2 — Option C: booth-rent revenue from off-platform (cat 3/4) vendors

Capture booth revenue without giving cat-3/4 vendors accounts.

- Extend `market_booth_placeholders` (off-platform vendor occupancy, already exists) with payment fields, OR a small companion table: amount, status, stripe ids.
- Manager UI: "request booth payment" on a placeholder → generates a Stripe Checkout link (destination charge to the manager's Connect account, reusing `calculateBoothRentalFees`).
- No-auth tokenized payment page the off-platform vendor opens → pays (no login).
- Webhook marks the placeholder/payment paid.
- Reuses the booth-rent fee math + destination-charge pattern from `weekly_booth_rentals`. Scope: ~1 migration + manager UI + no-auth payment page + webhook handling. Moderate; its own build.

## Phase 3 (later) — Option B: lite self-serve booth accounts

Cat-3/4 vendor gets a minimal `vendor_profile` (`sell_eligible=false`): can log in and self-serve booth booking via the EXISTING flow, but no selling onboarding, listings/market-box tools hidden, **not shown in any buyer-facing discovery** (no public profile, not in "shop this market" lists), slimmed bookings-only dashboard. Re-decide COI then. Risk: the `sell_eligible` gate must cover every selling entry point.

---

## Open / to-draft when this is picked up
- Exact upfront rejection copy for the cat-3/4 signup block (user may want to react to real words).
- Where in the signup flow the front-step lands (before account creation vs after, before vs interleaved with `vendor_type`/regulatory category selection).
- Whether the gate also applies to event vendors (`event_approved`) or only standard market selling.

## Related
- Composable-roles decision + booth-rental math (`decisions.md` 2026-06-13, 2026-05-19).
- Existing: 3-gate onboarding, `vendor_type` (regulatory product categories — orthogonal to these production categories), `market_booth_placeholders` (mig 135), booth-rent flow (migs 139/142/144).
