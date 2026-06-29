# Operator Revenue Projection Tool — concept & refinement notes

**Built 2026-06-28 · committed `9a7e4cac` · on staging.** Refine later — this captures the page + the ideas behind it.

## What it is
Public, unauthenticated, client-side calculator. **No DB, no auth, pure math.**
- Route: `/[vertical]/operator-projection`
- Files: `src/app/[vertical]/operator-projection/page.tsx` (server shell) + `src/components/projection/OperatorProjectionTool.tsx` (the calculator).
- **Two purposes:** (1) **RM onboarding** — a prospective Regional Manager projects multi-property revenue; (2) **market-manager transition** — an existing manager sees what they'd make by switching their vendors to platform booth rentals. Audience toggle switches framing (single market vs multi-property + $1k license).

## Economics it's grounded in (our REAL numbers — cite, don't trust memory)
- **Booth fee math:** `pricing.ts calculateBoothRentalFees`. Operator receives `base × 93.5%` (base − 6.5%). Vendor pays `base + 6.5% + $0.15`. Platform keeps both markups + flat. **$25 booth → vendor $26.78, operator $23.37, platform $3.41.**
- The platform's $3.41 = **operator-side $1.63** (the markdown from base) + **vendor-side $1.78** (6.5% + $0.15).
- **Product-order fees** (`pricing.ts FEES`, a SEPARATE stream): buyer +6.5%+$0.15, vendor −6.5%−$0.15. **Not shared** with RM/manager (decided out of v1).

## The big idea: the operator-keep % lever
- The tool's **headline editable field**. Default **93.5%** (current rate). Raise toward 100% to model a **switch incentive**.
- **The affordable lever:** rebate the **operator-side 6.5%** ($1.63 on a $25 booth) back to the operator → they keep up to **100% of base**. The platform still earns the **vendor-side $1.78/booth regardless** — cash-positive on a market we previously earned $0 on. One 40-booth × 30-week market ≈ $2,100/yr to the platform even at 100% operator keep.
- **Illustrative ladder (per $25 booth):** off-platform 100% (manual/cash) → on-platform standard **93.5%** ($3.41 platform) → **Founding Partner 100% of base** ($1.78 platform) → **RM** = favorable rate **+ territory + multi-market + $1k license**.
- **Coherence rule:** the favorable *rate* is the on-ramp; the RM *license* buys **territory + scale**, not a better per-booth rate — so no path is punished. switch → partner → RM.
- **DEFERRED (business decision):** the actual % rules — who gets 93.5 vs 100, founding-cohort vs volume-gated vs permanent. The tool keeps % a **free field** so we tune/finalize later.

## RM model context (conceptual — no RM code exists yet)
- RM = a business arrangement layered on existing manager identities; **1 market = 1 Stripe account** (mig 141). Awaiting Phase 0 validation (`decisions.md` 2026-06-12).
- **License $1,000/yr** (user-confirmed default; editable in tool).
- **Property-owner revenue share** = an RM **operating cost** (% of operator revenue), per user.

## Implementation note for the REAL incentive (when/if we build it)
To actually pay an operator > 93.5%, the booth checkout's `transfer_data.amount` must be raised (platform keeps less) — a **per-market "operator keep rate" config** read by `payments.ts createBoothRentalCheckoutSession` + `createSeasonBoothCheckoutSession`, OR a periodic rebate payout. Per-market config is cleaner. **Not built — the tool is projection-only.**

## v1 simplifications / what's deferred
- Operator-keep % is a single free field; **tier rules deferred**.
- **Ramp** = a year-1 factor (none/3/6/12mo → 1 / 0.875 / 0.75 / 0.625), not month-by-month occupancy.
- **Staffing** folded into the operating-cost list (no separate pay-structure calculator: flat-per-day / salary / % of revenue).
- Dropped non-economic inputs: region name, population covered.
- FM/FT split via a per-space **category** tag; dual-use = both categories in one property.
- **Not linked in nav yet** — open offer: a CTA from `market-manager-program`.

## Refinement backlog (revisit later)
- Incentive **tier rules + presets** (founding cohort, volume thresholds, time-limited) once the business decision lands.
- **Month-by-month ramp** + a manual occupancy curve.
- **Staffing pay-structure calculator** (flat/day, salary, % of revenue) feeding the capacity warning.
- Explicit **"Today (off-platform) vs on-platform" side-by-side** for the manager view (currently implied by the keep-% slider).
- **Region / population** framing inputs for marketing polish.
- **Save / share a scenario** via URL params — a prospect could send us their projection (a lead-gen hook).
- **Multi-year view** (Year-1 ramp → Year-2+ steady state).
- Link from `market-manager-program`; a vendor-facing "why booths on platform" angle.
- Optional: model a **product-sale revenue share** if it ever becomes a real RM perk.

## Disclaimers (in the UI)
All outputs labeled **estimates, not guaranteed income**; the keep-% is explicitly **"not an offer."** Standard "results depend on location, demand, weather, regulations, management, marketing."
