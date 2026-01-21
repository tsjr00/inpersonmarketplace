# i18n Spanish Language Support Plan

## Status: PLANNED (Not Yet Started)
**Target Start:** After core English functionality is stable (estimated Phase N+)

---

## Overview

The marketplace will support Spanish as a second language to better serve bilingual communities. This document outlines the implementation plan.

---

## Recommended Approach

### Library: `next-intl`
- Best integration with Next.js 14+ App Router
- Handles pluralization, date/currency formatting
- Type-safe translation keys

### URL Structure
```
/en/farm2table/browse    (English)
/es/farm2table/browse    (Spanish)
```

---

## Implementation Phases

### Phase 1: Infrastructure (2-3 days)
- Install and configure `next-intl`
- Set up locale routing in middleware
- Create translation file structure (`/messages/en.json`, `/messages/es.json`)
- Add language switcher to header

### Phase 2: Extract Static Text (5-7 days)
- Replace all hardcoded strings with translation keys
- Organize by feature: `auth.*`, `cart.*`, `checkout.*`, `vendor.*`, etc.
- ~500-800 strings estimated

### Phase 3: Professional Translation (3-5 days external)
- Send `en.json` to professional translator
- Budget: ~$1,500-4,000 for 15,000-20,000 words
- Alternative: AI translation + human review

### Phase 4: Testing & Polish (2-3 days)
- Fix text overflow (Spanish is 20-30% longer)
- Verify date/number formatting
- Test all user flows in both languages

---

## Scope

### In Scope (Phase 1)
- Static UI: buttons, labels, navigation, error messages
- Marketing pages: upgrade, about, FAQ, help
- Email templates
- System categories and market types

### Out of Scope (Initially)
- User-generated content (listings, vendor bios, reviews)
- Real-time translation of vendor content
- Additional languages beyond Spanish

---

## Code Preparation (Do Now)

### Avoid These Anti-Patterns

**String Concatenation (BAD):**
```tsx
// Cannot translate properly - word order differs by language
<p>{"You have " + count + " items"}</p>
<p>{`Welcome back, ${userName}!`}</p>
```

**Correct Approach (GOOD):**
```tsx
// Use interpolation placeholders
<p>{t('cart.itemCount', { count })}</p>
<p>{t('greeting.welcomeBack', { name: userName })}</p>
```

**Conditional Text Fragments (BAD):**
```tsx
<p>{count} {count === 1 ? "item" : "items"}</p>
```

**Correct Approach (GOOD):**
```tsx
// Use ICU plural syntax in translation file
// en.json: "cart.items": "{count, plural, one {# item} other {# items}}"
<p>{t('cart.items', { count })}</p>
```

**Split Sentences (BAD):**
```tsx
<p>Click <a href="...">here</a> to continue</p>
```

**Correct Approach (GOOD):**
```tsx
// Use rich text support
<p>{t.rich('clickToContinue', { link: (chunks) => <a href="...">{chunks}</a> })}</p>
```

---

## Estimated Timeline

| Phase | Duration |
|-------|----------|
| Infrastructure | 2-3 days |
| String extraction | 5-7 days |
| Translation (external) | 3-5 days |
| Testing | 2-3 days |
| **Total** | **~3-4 weeks** |

---

## Trigger Criteria

Start i18n work when:
- [ ] Core buyer flow complete (browse, cart, checkout, pickup)
- [ ] Core vendor flow complete (signup, listings, orders, fulfillment)
- [ ] Admin essentials working
- [ ] UI text mostly finalized
- [ ] App is "beta ready"

---

## Budget Estimate

| Item | Cost |
|------|------|
| Professional translation | $1,500 - $4,000 |
| Developer time (3-4 weeks) | Internal |
| Ongoing maintenance | ~30 min per new feature |

---

## References

- [next-intl Documentation](https://next-intl-docs.vercel.app/)
- [ICU Message Format](https://unicode-org.github.io/icu/userguide/format_parse/messages/)

---

---

## Audit Results (January 21, 2026)

### Pluralization Patterns Found

The following files use inline pluralization that will need conversion to ICU format:

| File | Line | Pattern |
|------|------|---------|
| `components/cart/CartDrawer.tsx` | 63 | `{itemCount} {itemCount === 1 ? 'item' : 'items'} in your cart` |
| `components/markets/MarketsWithLocation.tsx` | 233 | `{markets.length} market{...} found` |
| `components/markets/MarketCard.tsx` | 221 | `{vendor_count} vendor{...}` |
| `app/admin/page.tsx` | 63 | `{stalePendingCount} vendor{...} pending approval` |
| `app/[vertical]/vendor-signup/page.tsx` | 368 | `registered at {marketCount} market{...}` |
| `app/admin/markets/page.tsx` | 84, 770 | `{count} market{...} found` |
| `app/[vertical]/vendor/[vendorId]/profile/page.tsx` | 248 | `{count} listing{...}` |
| `app/[vertical]/vendor/pickup/page.tsx` | 279, 376 | `{count} item{...} ready` |
| `app/[vertical]/vendor/markets/page.tsx` | 537 | `join {limit} market{...}` |
| `app/[vertical]/dashboard/page.tsx` | 243, 360 | `{count} item{...} ready`, `{count} order{...}` |
| `app/[vertical]/vendor/market-boxes/page.tsx` | 222 | `{limit} market box offering{...}` |
| `app/[vertical]/browse/page.tsx` | 235, 415 | `{count} market box{es}`, `{count} listing{...}` |
| `app/[vertical]/markets/[id]/page.tsx` | 256 | `{count} vendor{...}` |
| `app/[vertical]/admin/page.tsx` | 160 | `{count} vendor{...} pending` |
| `app/[vertical]/admin/markets/page.tsx` | 361 | `{count} market suggestion{...}` |

**Mitigation:** Created `src/lib/pluralize.ts` helper that centralizes pluralization logic for easier future conversion.

### Embedded Variable Sentences Found

| File | Line | Pattern | Issue |
|------|------|---------|-------|
| `app/page.tsx` | 166 | `Welcome to ${brandName}` | Word order may differ |
| `app/[vertical]/dashboard/page.tsx` | 152 | `Welcome back, {name}!` | Word order may differ |
| `app/[vertical]/signup/page.tsx` | 140 | `Welcome to {brand_name}.` | Word order may differ |

**Status:** Low priority - these are simple patterns that i18n libraries handle well.

### Patterns NOT Found (Good!)

- No string concatenation with `+` operator in user-facing text
- No "Click here" split link patterns
- No complex multi-variable sentence constructions

### Recommendation

These patterns are **acceptable for now**. They will all be addressed during the i18n sprint. The pluralization helper (`src/lib/pluralize.ts`) provides a centralized location that can be searched and replaced during conversion.

---

## Notes

- Created: January 21, 2026
- Audit completed: January 21, 2026
- Decision: Wait until English functionality stable before implementing
- See also: `Premium_Features_Catalog.md` for text that will need translation
