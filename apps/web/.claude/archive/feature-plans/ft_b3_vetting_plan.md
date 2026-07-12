# FT Park Vetting — B3 Plan (doc upload + manager vetting + cancel-without-refund)

**Created:** 2026-07-05. **Mode:** Report — plan only. Part of the **book-then-vet (B)** direction (`fm_regroup_ft_money_vetting_plan.md` Part 3). B3 is the enforcement + review layer. **Non-blocking always** — nothing here stops a booking.

## DECISIONS (user 2026-07-05)
- **No doc-upload duplication.** B3 does NOT add a new upload path — it **reuses the EXISTING** `vendor_verifications` + upload components (`COIUpload` / `FoodTruckPermitUpload` / certs / `CategoryDocumentUpload`) + the vendor-documents bucket. B3 only *surfaces* park-context completeness + a review action on top of the same store. (If anything, the park view is a new lens on the same docs, not a second uploader.)
- **Cancel ≠ resell.** Barring/cancelling a non-compliant truck does **NOT** free the spot for someone else — *"I don't plan on letting someone else use what they paid for."* The motivation is the **THREAT** (lose your fee + get future-blocked), not operator resale. → the paid booking **keeps holding the slot** (never reopened), is marked barred, and gets no refund.
- **Manager discretion.** Cancelling a specific truck AND future-blocking are both **manager choices**, never automatic.
- **Blocking is general-purpose.** The block is **not** doc-specific — the manager can block a truck for ANY reason. `park_vendor_vetting.blocked` + reason, manager-initiated.
- **Storage:** new `park_vendor_vetting` table. **Build:** all of B (B1→B3) as one sequence, after the FT-port prod push.

## Dependency chain (verified — this is the key insight)
The existing manager doc-review surface (`api/market-manager/[marketId]/vendor-docs/[vendorProfileId]/route.ts`) enforces **3 gates**: (1) caller is the market manager, (2) a **`market_vendors` row exists** for the vendor at this market, (3) the vendor gave **`_info_sharing_consent`** (a synthetic entry in `vendor_market_agreement_acceptances.statements_snapshot`). It returns `vendor_verifications` (COI status/docs, `category_verifications[cat].documents`, onboarding_completed_at, …).

So B3 only works if the earlier pieces feed it:
- **B1** must capture **info-sharing consent** (gate 3) alongside the doc-responsibility acknowledgment — so the manager is authorized to see the truck's docs.
- **B2** must create the **`market_vendors` row** (gate 2) on first booking — so the truck is reviewable + appears on the roster.
- Then **B3** reuses the *existing* vendor-docs surface for park vetting — little new read machinery.

## Verified existing infra to reuse
- **Doc storage/model:** `vendor_verifications` (COI + `category_verifications` JSONB with `documents[]`) + the `vendor-documents` bucket + signed-URL flow (`api/vendor-documents/signed-url`). Upload components already exist (`COIUpload`, `FoodTruckPermitUpload`, `CertificationsForm`, `CategoryDocumentUpload`).
- **Manager review page:** `[vertical]/market-manager/[marketId]/vendor-docs/[vendorProfileId]/page.tsx` + its route (above).
- **Notifications:** `sendNotification` + `lib/notifications/types.ts` registry (add types the standard way).
- **NOT present:** any `park_spot_bookings` cancel/refund route — **B3c is net-new** (the `'cancelled'` status exists in the enum but nothing writes it via a manager action).
- **Ties to HB2844 F1** (doc vault + renewal, `ft_hb2844_licensing_plan.md`): B3a is the park-scoped slice of that; the full DSHS-license vault is F1 later.

## B3 pieces

### B3a — Required-doc surfacing + upload (non-blocking)
- **v1 (reuse, no new upload UX):** trucks already upload COI / FT permit / certs during onboarding into `vendor_verifications`. Surface *completeness* to the truck at/after booking: "This park expects a current COI, food-truck permit, and food-safety cert — you have X of Y; upload the rest," linking to the existing doc-upload. **Booking already succeeded (B), so this is a nudge, never a gate.**
- **Required set — decision:** v1 = reuse the vendor's verification completeness (COI valid + requested-category docs). A park-manager-configurable required list (driven by the P5 agreement statements / a park config) is a later enhancement; the full DSHS packet is HB2844 F1.

### B3b — Manager vetting surface + notification (the user's key requirement)
- **Reuse** the vendor-docs route/page for park trucks (works once B1+B2 land).
- **Roster signal:** on the FT "Your trucks" tab, show each truck's doc status ("docs: complete / missing COI / expired") + a "Review docs →" link — mirrors the HB2844 "X of Y trucks license-ready" thesis. (The roster already renders a "View docs" link when consent exists — extend it with status.)
- **⭐ NEW notification `park_truck_docs_to_review`** → the park manager when a truck **uploads or updates** docs (or first books with docs pending). Dedup via the notifications table (standard pattern). This is the "manager gets notified about new truck docs to review" requirement.
- **Manager review action:** mark-reviewed / flag-incomplete. Needs a small state store (see Data model).

### B3c — Bar + block enforcement (net-new, ⚠ money — manager discretion)
Two SEPARATE manager tools, both discretionary:

**(1) Bar a specific paid booking (no refund, NO resale).** `POST api/market-manager/[marketId]/park-bookings/[bookingId]/bar` — marks the truck as barred from that date: **the booking row stays `paid` so the slot is NOT reopened** (the partial-unique index keeps holding it — nobody else can book it). Add `manager_barred_at` + `bar_reason` to `park_spot_bookings`. Effect: truck can't attend, **no Stripe refund**, **slot not resold** (the operator does NOT profit twice — the penalty is the truck's lost fee, per user). Attendance/where-today should exclude a barred booking. Reason required; confirm dialog.
- **⚠️ Money semantics (verify at build):** destination charge already paid the operator + platform fee. "No refund" = do nothing financially (no `createRefund`, no clawback). Keeping status `paid` means no refund path fires. **This forfeits real vendor income** — deliberate, reason-required, grounded in the accepted B1 terms.

**(2) Block future bookings (general-purpose, ANY reason).** `park_vendor_vetting.blocked` + `block_reason` + `blocked_at`, manager-set. Checked at `book-park-spot` + `standing-reservation` → 403 if blocked. **Not doc-specific** — a manager can block a truck for any reason (conduct, no-shows, etc.); docs are just one motivation.

- **⭐ NEW notification `park_booking_barred`** → the truck (barred from date X, no refund, why). **`park_vendor_blocked`** → the truck (blocked from future bookings, why).
- **The "threat" is the product:** B1's acknowledgment + a visible "your docs are incomplete" nudge is the lever; actual barring/blocking is the manager's last resort, not an automated punishment.

## Data model (decided)
- **NEW `park_vendor_vetting` table** (market_id, vendor_profile_id, `docs_reviewed_at`, `review_status`, `blocked BOOLEAN`, `block_reason`, `blocked_at`) — keeps FT concerns off the shared `market_vendors`. Holds the review state + the **general-purpose** future block.
- **`park_spot_bookings` += `manager_barred_at TIMESTAMPTZ NULL`, `bar_reason TEXT NULL`** — the per-booking bar (row stays `paid`, slot not resold).
- **Notification types:** +3 (`park_truck_docs_to_review` → manager; `park_booking_barred` + `park_vendor_blocked` → truck) — registry + i18n keys + NI tripwire bump.
- **Migration:** 1 (table + 2 booking columns); non-destructive, additive.

## Sequencing
**B1 (acknowledgment + info-sharing consent)** → **B2 (auto-affiliate `market_vendors` on first booking)** → **B3b (review surface + docs-to-review notification)** → **B3c (cancel-without-refund + block + notification)** → **B3a (required-doc completeness nudge)** — or fold B3a into HB2844 F1.

B3 cannot start before B1+B2 (gates 2 & 3). Estimate: B1 ~S, B2 ~S–M, B3b ~M, B3c ~M (money-adjacent, careful), B3a ~S (reuse).

## Decisions — RESOLVED (user 2026-07-05)
1. **Required-doc set v1:** reuse existing verification completeness — **no new uploader.** ✅
2. **Vetting storage:** new `park_vendor_vetting` table. ✅
3. **Bar semantics:** slot **NOT** reopened/resold; the paid row keeps holding it; no refund; reason required. Block is **general-purpose** (any reason), manager discretion. ✅
4. **Build:** all of B (B1→B3) as one sequence, after the FT-port prod push. ✅

Remaining open items are build-time implementation details (which upload-route hook fires the docs-to-review notification; whether a barred booking is exempt from the no-show strike), not user decisions.
