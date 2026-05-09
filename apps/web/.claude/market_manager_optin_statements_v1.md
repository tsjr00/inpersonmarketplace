# Market Manager Opt-In Vendor Agreement Statements — v1 starter set

**Status:** Drafted Session 80 (2026-05-08). 15 statements across 5 categories — `product/quality`, `conduct`, `insurance`, `fees`, `compliance`.

## Purpose

Market managers select which statements apply to their market during the onboarding flow (per `market_manager_v2_plan.md` Section H). Vendors who sign up via the manager's referral link must accept each selected statement during signup. The system records the accepted statements + timestamp + payment confirmation as an electronic agreement record.

This is the **starter menu**. Managers can request additional statements via support; we curate and add to the catalog over time.

## Design notes

- **Voice:** first person from vendor perspective ("I will...", "I have...", "I understand..."). Reads as a checkbox list during signup.
- **Specificity:** statements include placeholders like `{open_time}` / `{distance_miles}` / `{notice_days}` for values the manager fills in when picking the statement. The system substitutes at vendor-signup render time.
- **Avoid** statements that overlap with the platform-wide vendor agreement (`src/lib/legal/content/vendor-service-agreement.ts`) — those are non-optional. This menu is for per-market policies on top of the baseline.
- **Statements are independent:** picking statement A doesn't require picking statement B. Manager selects à la carte.

## Database shape (proposal — to confirm during Phase 3 build)

```sql
CREATE TABLE market_optin_statement_catalog (
  id TEXT PRIMARY KEY,                  -- e.g., 'producer-only-v1'
  category TEXT NOT NULL,               -- product_quality | conduct | insurance | fees | compliance
  statement TEXT NOT NULL,              -- the vendor-facing copy with {placeholders}
  placeholders TEXT[] NOT NULL,         -- list of placeholder keys the manager fills
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE market_optin_selections (
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  statement_id TEXT REFERENCES market_optin_statement_catalog(id),
  placeholder_values JSONB,             -- e.g., {"open_time": "8:00 AM", "distance_miles": 50}
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (market_id, statement_id)
);

CREATE TABLE vendor_market_agreement_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_profile_id UUID REFERENCES vendor_profiles(id),
  market_id UUID REFERENCES markets(id),
  accepted_statements JSONB NOT NULL,   -- snapshot: [{statement_id, statement_text, placeholder_values}]
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payment_confirmation_ref TEXT         -- Stripe payment intent / checkout session
);
```

The `accepted_statements` is a JSONB **snapshot** of the rendered statement text and the placeholder values at the moment of acceptance — so even if the manager changes the statements later or the catalog is updated, the vendor's historical agreement is preserved exactly as accepted.

## The starter set — 15 statements

### Product / Quality (3)

**1. Producer-only**
```
id: producer-only
category: product_quality
statement: I produce, grow, or hand-craft all items I sell at this market. I do not resell items produced by others.
placeholders: []
```

**2. Local sourcing radius**
```
id: local-sourcing
category: product_quality
statement: All raw ingredients or materials I use are sourced within {distance_miles} miles of this market, except where specifically noted on the item.
placeholders: [distance_miles]
```

**3. Accurate pricing display**
```
id: accurate-pricing
category: product_quality
statement: I will display prices clearly on every item or signage at my booth, and I will honor the displayed price for any sale during the market session.
placeholders: []
```

### Conduct (3)

**4. Setup and teardown timing**
```
id: setup-teardown
category: conduct
statement: I will have my booth fully set up by {setup_complete_time} and will not begin tearing down before {teardown_earliest_time}, regardless of sales activity or weather.
placeholders: [setup_complete_time, teardown_earliest_time]
```

**5. Booth assignment compliance**
```
id: booth-assignment
category: conduct
statement: I will set up only in the booth space assigned to me by market staff. I will not occupy adjacent spaces or expand beyond my assigned footprint without prior approval.
placeholders: []
```

**6. Professional behavior toward staff and other vendors**
```
id: professional-conduct
category: conduct
statement: I will treat market staff, fellow vendors, and shoppers with respect. I will not engage in confrontational behavior, disparage other vendors, or attempt to undercut neighboring vendors' pricing during the market session.
placeholders: []
```

### Insurance / Liability (3)

**7. Current liability insurance**
```
id: liability-insurance
category: insurance
statement: I maintain a current general liability insurance policy with coverage of at least {coverage_amount}, and I will provide a Certificate of Insurance naming this market as additional insured upon request.
placeholders: [coverage_amount]
```

**8. Vendor assumes own risk**
```
id: vendor-risk
category: insurance
statement: I understand that I am responsible for my own equipment, inventory, and personal property at the market, and that the market is not liable for damage, theft, or loss.
placeholders: []
```

**9. Indemnification of market**
```
id: indemnification
category: insurance
statement: I agree to indemnify and hold harmless the market and its operators from any claim, damage, or liability arising from the products I sell or my conduct at the market.
placeholders: []
```

### Fees / Payment (3)

**10. Booth fee non-refundable except for market cancellation**
```
id: booth-fee-nonrefundable
category: fees
statement: I understand booth fees are non-refundable, except in the case of market cancellation by market management. Cancellations by the vendor with at least {notice_days} days' notice may be eligible for a credit toward a future market session at the manager's discretion.
placeholders: [notice_days]
```

**11. No-show forfeiture**
```
id: no-show-forfeiture
category: fees
statement: If I fail to arrive at the market without prior cancellation, my booth fee is forfeit and I may be denied future booth reservations until the situation is resolved with market staff.
placeholders: []
```

**12. Vendor pays all sales tax**
```
id: vendor-sales-tax
category: fees
statement: I am responsible for collecting and remitting any applicable sales tax on items I sell at this market, and I will provide market staff with my sales tax permit number upon request.
placeholders: []
```

### Compliance (3)

**13. Active health permits**
```
id: health-permits
category: compliance
statement: I hold all health department permits required for the products I sell at this market, and I will provide copies upon request. I will notify the market manager immediately if any required permit is suspended, revoked, or lapsed.
placeholders: []
```

**14. Food safety practices**
```
id: food-safety
category: compliance
statement: I follow all applicable food safety guidelines for my product type, including temperature control, hand-washing, sample-handling, and cross-contamination prevention. I will keep food safety equipment (gloves, sanitizer, thermometers) available at my booth.
placeholders: []
```

**15. No prohibited items**
```
id: prohibited-items
category: compliance
statement: I will not sell or display any items prohibited at this market, including alcohol, tobacco products, firearms, recalled or unsafe products, or items not produced by me. I understand that listing or selling prohibited items may result in immediate removal from the market and forfeiture of fees paid.
placeholders: []
```

## Implementation notes for Phase 3 build

- **Manager onboarding step:** show the 15 statements grouped by category. Manager checks the ones they want to apply. For statements with `placeholders`, manager fills in the values inline.
- **Vendor signup step (co-branded):** show the manager-selected statements as a checkbox list. Each must be checked individually. Cannot proceed without all checked.
- **Agreement record:** snapshot the rendered statement text + placeholder values + timestamp + payment ref into `vendor_market_agreement_acceptances`. Display this as a "View Agreement" link in the vendor's dashboard, scoped to that market.
- **Updates:** if manager changes selected statements later, existing acceptances stay frozen at the original text. New vendors signing up after the change get the new set. (The snapshot is the source of truth for what the vendor agreed to.)

## Out of scope for v1 — deferred

- Manager authoring custom statements (catalog is curated)
- Multi-language support for statements
- Statements requiring file upload (e.g., "attach your insurance certificate") — handled separately by the existing COI gate
- Per-statement legal disclaimers (the platform-wide vendor agreement covers the legal frame)

## Validation

When user reviews real market agreements they have access to (Amarillo / Canyon market managers), check whether anything common is missing from this 15. Add the obvious gaps before Phase 3 build kickoff.
