# FastWrks BuildApp - Project Context

**FOR CC TO READ BEFORE STARTING ANY BUILD TASK**

**Version:** 1.0  
**Last Updated:** January 14, 2026  
**Purpose:** Provide essential context for autonomous development

---

## What Is FastWrks?

**Multi-brand marketplace platform** connecting vendors with buyers for pre-sale orders, flash sales, and subscription boxes.

**Two verticals:**
- **fastwrks.com** - Fireworks marketplace
- **farmersmarket.app** - Farmers market/cottage food marketplace

**Business model:** Transaction fees (9.3% net) + subscription revenue (buyer & vendor tiers)

**Core value proposition:**
- Vendors: Pre-sales reduce waste, predictable revenue, reach more customers
- Buyers: Guaranteed availability, skip lines, support local vendors

---

## Tech Stack (DO NOT DEVIATE)

**Frontend:**
- Next.js 14 (App Router)
- React 18
- TypeScript (strict mode)
- Tailwind CSS (utility classes only, no custom CSS)

**Backend:**
- Next.js API routes
- Supabase (PostgreSQL + Auth + RLS)
- Stripe Connect (payments)

**Deployment:**
- Vercel (Staging: farmersmarket.app, fastwrks.com)
- Supabase Dev (localhost:3002) + Staging projects

**Component Library:**
- AdminTable (sortable/filterable tables)
- StandardForm (forms with validation)
- StatusBadge (status indicators)
- MobileNav (mobile navigation)
- Location: `/apps/web/src/components/shared/`

---

## Project Structure

```
/apps/web/
  /src/
    /app/
      /[vertical]/          # Dynamic routing (fireworks, farmers_market)
        /vendor/            # Vendor dashboard
        /buyer/             # Buyer account
        /markets/           # Market pages
      /admin/               # Admin dashboard
      /api/                 # API endpoints
    /components/
      /shared/              # Component library
      /markets/             # Market-specific components
      /analytics/           # Analytics components
    /lib/
      /stripe/              # Stripe utilities
      /supabase/            # Supabase client
  /scripts/
    seed-data.ts            # Test data generation
  /supabase/
    /migrations/            # Database migrations
```

**Vertical routing:** All routes include `[vertical]` dynamic segment (fireworks or farmers_market)

---

## Database Conventions

### Migration Naming

**Format:** `YYYYMMDD_phase_x_description.sql`

**Examples:**
- `20260114_phase_k1_markets_tables.sql`
- `20260114_phase_k1_add_market_to_listings.sql`

**Process:**
1. Create migration file in `/supabase/migrations/`
2. Document in `/docs/MIGRATION_LOG.md` (both table and details)
3. Tracy applies to Dev, tests, then Staging

### RLS (Row Level Security)

**ALL tables must have RLS enabled.**

**Common patterns:**
- Users see their own data: `WHERE user_id = auth.uid()`
- Vendors see their items: `WHERE vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid())`
- Admins see everything: `WHERE EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin')`
- Public reads: `FOR SELECT USING (active = true)`

**Always create policies for:** SELECT, INSERT, UPDATE, DELETE (as needed)

### Naming Conventions

**Tables:** Plural, snake_case (`markets`, `order_items`, `vendor_payouts`)

**Columns:** snake_case (`created_at`, `stripe_account_id`, `buyer_fee_percent`)

**Enums:** snake_case type name, lowercase values
```sql
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'completed', 'cancelled');
```

**Foreign keys:** `{table}_id` (e.g., `market_id`, `vendor_id`)

**Timestamps:** Always include `created_at` and `updated_at` (use trigger for updates)

---

## Key Business Rules

### Transaction Fees (NEVER CHANGE)

**Split fee model:**
- Buyer pays: base price + 6.5%
- Vendor receives: base price - 6.5%
- Platform net: ~9.3% of base (after Stripe fees ~2.9% + $0.30)

**Example:** $50 bundle
- Buyer pays: $53.25
- Vendor receives: $46.75
- Platform keeps: $4.65 (after Stripe)

**Applies to:** All transactions (pre-sales, flash sales, market boxes)

### Market Types (CRITICAL)

**Type A: Fixed Market (Traditional)**
- Fixed location and schedule
- Multiple vendors
- Multi-vendor cart enabled
- Example: Downtown Farmers Market, every Saturday 8am-1pm

**Type B: Private Pickup (Cottage/Flexible)**
- Fixed location (vendor's home/farm)
- Flexible schedule (vendor sets per listing)
- Single vendor only
- Multi-vendor cart NOT allowed
- Requires buyer pickup time confirmation

**Multi-vendor cart restriction:**
- ONLY works for Fixed Markets
- All items must be: same market + same pickup date
- System must block Private Pickup + Fixed Market combinations

### Tier Systems

**Buyer Tiers:**
- **Free:** All features, no early access
- **Premium ($9.99/mo):** 10-min flash sale head start, 2-hour bundle head start, Monthly Market Box access

**Vendor Tiers:**
- **Standard (Free):** 7 bundle limit, 2 flash sales/week, 2 concurrent Market Boxes
- **Premium ($24.99/mo):** Unlimited bundles, unlimited flash sales, unlimited Market Boxes, VIP customer list (25 max), analytics dashboard

### Bundle Limits

**Standard vendors:** Hard stop at 7 bundles
**Premium vendors:** Unlimited

**Warning at 5 bundles:** "We recommend keeping 5 bundles for best results"

### Flash Sales

**Standard vendors:** 2 per week (resets Sunday midnight)
**Premium vendors:** Unlimited

**Location restriction:** Cannot have overlapping flash sales at different locations

### VIP System (Premium Vendors Only)

**Capacity:** 25 VIP customers per vendor
**Benefits:** 5-min flash sale head start, 1-hour bundle head start
**Auto-removal:** After 6 months of purchase inactivity

### Monthly Market Box

**Buyer eligibility:** Premium members only
**Vendor capacity:** Standard = 2 concurrent, Premium = unlimited
**Structure:** 4-week prepaid, buyer pays once upfront
**Weekly pickups:** Vendor marks ready each week, buyer confirms pickup

---

## Current Development Phase

**Today's work:**
- Phase L-1: Component Library (COMPLETE ✅)
- Phase M-1: Seed Data Script (COMPLETE ✅)
- Phase N-1: Pre-commit Hooks (COMPLETE ✅)

**Next (Parallel Sessions):**
- **Phase K-1:** Markets Foundation (you may be building this)
- **Phase K-2:** Vendor Analytics (you may be building this)

**Future phases:**
- Phase 3: Core Commerce Engine (orders, payments, Stripe)
- Phase 4: Market Types enforcement
- Phase 5: Tier Management
- Phase 6: Flash Sales
- Phase 7: VIP + Notifications
- Phase 8: Monthly Market Box

**Refer to:** `/docs/FastWrks_Build_Plan.md` for full phase details

---

## Existing Tables (DO NOT RECREATE)

**Already exist:**
- `auth.users` (Supabase Auth)
- `user_profiles` (role, tier, created_at)
- `verticals` (vertical_id, name, domain, buyer_fee_percent, vendor_fee_percent)
- `vendors` (user_id, vertical_id, tier, stripe_account_id, etc.)
- `listings` (vendor_id, title, price, quantity, status, listing_type, etc.)
- `orders` (buyer_user_id, status, totals, etc.)
- `order_items` (order_id, listing_id, vendor_id, status, etc.)

**Check existing schema before creating tables.** Use `\d table_name` in psql or Supabase Table Editor.

---

## Development Standards

### Code Style

**TypeScript:**
- Strict mode enabled
- Explicit types (avoid `any`)
- Interface over type for objects
- Export interfaces used by multiple files

**React:**
- Functional components only (no class components)
- Hooks (useState, useEffect, custom hooks)
- Server components by default (Next.js 14)
- Client components: Add `"use client"` at top when needed (interactivity, hooks)

**Tailwind:**
- Use utility classes only
- No custom CSS files
- Mobile-first (design for 375px, scale up)
- Responsive breakpoints: sm (640px), md (768px), lg (1024px)

### File Naming

**Components:** PascalCase (`AdminTable.tsx`, `MarketCard.tsx`)
**Pages:** kebab-case (`create-listing.tsx`, `[id].tsx`)
**Utilities:** camelCase (`stripeUtils.ts`, `formatCurrency.ts`)

### API Endpoints

**Structure:**
```
/app/api/
  /markets/
    route.ts              # GET, POST
    /[id]/
      route.ts            # GET, PATCH, DELETE
      /vendors/
        route.ts          # GET, POST
```

**Response format:**
```typescript
// Success
return NextResponse.json({ data: result }, { status: 200 });

// Error
return NextResponse.json({ error: 'Message' }, { status: 400 });
```

**Always verify auth:** Check `auth.uid()` via Supabase client

---

## Testing Requirements

### Manual Testing Checklist

**Database:**
- [ ] Migrations apply without errors
- [ ] RLS policies enforce permissions correctly
- [ ] Foreign key constraints work
- [ ] Cascading deletes work as expected

**API:**
- [ ] Endpoints return correct data
- [ ] Auth checks prevent unauthorized access
- [ ] Error handling works
- [ ] Status codes appropriate

**UI:**
- [ ] Pages load without errors
- [ ] Forms validate correctly
- [ ] Mobile responsive at 375px width
- [ ] Component library used where appropriate
- [ ] No console errors or warnings

---

## Component Library Usage

**ALWAYS use shared components when available:**

**AdminTable** - For any data table
```tsx
import AdminTable from '@/components/shared/AdminTable';

<AdminTable
  data={markets}
  columns={[
    { key: 'name', label: 'Market Name', sortable: true },
    { key: 'city', label: 'City', filterable: true },
  ]}
/>
```

**StandardForm** - For any form
```tsx
import StandardForm from '@/components/shared/StandardForm';

<StandardForm
  fields={[
    { name: 'name', label: 'Market Name', type: 'text', required: true },
    { name: 'type', label: 'Type', type: 'select', options: [...] }
  ]}
  onSubmit={handleSubmit}
/>
```

**StatusBadge** - For status indicators
```tsx
import StatusBadge from '@/components/shared/StatusBadge';

<StatusBadge status="active" />
<StatusBadge status="pending" size="lg" />
```

**MobileNav** - For mobile navigation
```tsx
import MobileNav from '@/components/shared/MobileNav';

<MobileNav
  items={[
    { href: '/dashboard', icon: <HomeIcon />, label: 'Home' },
  ]}
  currentPath={pathname}
/>
```

**Don't recreate these components.** If you need modifications, extend or wrap them.

---

## Critical Don'ts

**NEVER:**
- Change transaction fee percentages (always 6.5% + 6.5%)
- Allow multi-vendor cart for Private Pickup markets
- Skip RLS policies on any table
- Use custom CSS (Tailwind only)
- Create migrations without timestamps
- Merge to main (Tracy does this after testing)
- Use localStorage/sessionStorage in artifacts
- Recreate existing tables
- Deviate from tech stack

**ALWAYS:**
- Check for existing tables/components before creating
- Use component library when available
- Create migrations FIRST before API/UI work
- Document in MIGRATION_LOG if creating migrations
- Mobile-first design (375px width)
- TypeScript strict mode
- Server components by default (mark "use client" only when needed)

---

## Helpful Context Files

**Full feature/pricing details:** `/docs/FastWrks_Pricing_Features_v2_0.md`
**Complete build phases:** `/docs/FastWrks_Build_Plan.md`
**Migration tracking:** `/docs/MIGRATION_LOG.md`
**Session tracking:** `/docs/Session_Summaries/SESSION_LOG.md`

---

## When In Doubt

**Database question?** Check existing schema in Supabase or ask Tracy
**Business rule question?** Check FastWrks_Pricing_Features_v2_0.md
**Architecture question?** Ask Tracy before implementing
**Component exists?** Check `/components/shared/` first

**Remember:** You have autonomy for implementation details, but must follow established patterns and business rules.

---

*This document should be read at the start of every build session to maintain consistency and quality.*
