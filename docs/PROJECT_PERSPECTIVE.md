# Project Perspective for Claude Code (CC)

**Purpose:** Give a new CC instance everything needed to work effectively on this project from day one.

**Last Updated:** 2026-01-14

---

## Project Overview

**InPersonMarketplace** is a multi-vertical marketplace platform that supports different business types (fireworks stands, farmers markets, etc.) with a single codebase. Each "vertical" has its own branding, fields, and configuration but shares the same underlying infrastructure.

**Key concept:** The platform uses JSONB columns to store vertical-specific data, allowing flexibility without schema changes for each new vertical.

**Live environments:**
- **Dev:** Local development (localhost:3002) - Supabase project `vawpviatqalicckkqchs`
- **Staging:** farmersmarket.app, fastwrks.com - Supabase project `vfknvsxfgcwqmlkuzhnq`
- **Production:** Not yet created

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS (configured in apps/web) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Payments | Stripe Connect (vendors get paid directly) |
| Monorepo | Simple structure: /apps/web is the main app |

---

## Repository Structure

```
/inpersonmarketplace
├── /apps/web                    # Main Next.js application
│   ├── /src
│   │   ├── /app                 # Next.js App Router pages
│   │   ├── /components          # React components
│   │   │   ├── /shared          # Reusable components (AdminTable, StatusBadge, etc.)
│   │   │   ├── /cart            # Cart components
│   │   │   └── /layout          # Layout components
│   │   └── /lib                 # Utilities
│   │       └── /supabase        # Supabase client setup
│   ├── /scripts                 # Dev scripts (seed-data.ts, etc.)
│   └── package.json
├── /supabase/migrations         # Database migrations (canonical location)
├── /docs
│   ├── /Build_Instructions      # Task specs for CC
│   ├── /Session_Summaries       # Session logs
│   ├── MIGRATION_LOG.md         # Database change tracking
│   └── PROJECT_CONTEXT.md       # Architecture overview
├── /config                      # Vertical configurations
└── /.husky                      # Git hooks (pre-commit runs lint-staged)
```

---

## Database Schema - Critical Knowledge

### Key Tables

| Table | Purpose |
|-------|---------|
| `user_profiles` | Extends auth.users with app-specific data |
| `vendor_profiles` | Vendor accounts with vertical-specific data in JSONB |
| `verticals` | Marketplace configurations (fireworks, farmers_market) |
| `listings` | Products/services with JSONB listing_data |
| `orders` | Buyer orders (shopping carts) |
| `order_items` | Individual items in orders |
| `payments` | Stripe payment tracking |
| `vendor_payouts` | Stripe Connect transfers to vendors |

### CRITICAL: Foreign Key Relationships

**This is the #1 gotcha in this codebase:**

```
vendor_profiles.user_id → user_profiles.user_id (NOT user_profiles.id!)
```

The FK was changed in migration `20260106_155657_001_fix_vendor_profiles_fk.sql`. When inserting vendor_profiles, use the **auth.users.id** (authId), not the user_profiles.id (profileId).

**Correct:**
```typescript
await supabase.from('vendor_profiles').insert({
  user_id: authUserId,  // auth.users.id
  ...
});
```

**Wrong:**
```typescript
await supabase.from('vendor_profiles').insert({
  user_id: userProfileId,  // user_profiles.id - WRONG!
  ...
});
```

### Database Trigger

There's a trigger that **automatically creates a user_profile** when an auth user is created:

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_profile_for_user();
```

**Implication:** Don't try to INSERT into user_profiles after creating an auth user - query for the auto-created profile instead and UPDATE it if needed.

### JSONB Patterns

Vendor business names and other vertical-specific data are stored in JSONB:

```typescript
// Querying
const { data } = await supabase
  .from('vendor_profiles')
  .select('profile_data');

const businessName = data.profile_data.business_name;
const farmName = data.profile_data.farm_name;  // farmers_market vertical
```

---

## Code Patterns

### Supabase Client Usage

**Browser (client components):**
```typescript
import { createClient } from '@/lib/supabase/client';
const supabase = createClient();
```

**Server (API routes, server components):**
```typescript
import { createClient } from '@/lib/supabase/server';
const supabase = await createClient();
```

**Scripts (with service role for admin access):**
```typescript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(url, serviceRoleKey);
```

### Component Library

Reusable components in `/apps/web/src/components/shared/`:

- **AdminTable** - Sortable, filterable data tables with pagination
- **StandardForm** - Forms with validation and error handling
- **StatusBadge** - Status indicators (pending, active, approved, etc.)
- **MobileNav** - Bottom navigation for mobile

### Styling

- Use **Tailwind CSS utility classes only**
- Mobile-first approach (375px base, then md:, lg: breakpoints)
- No custom CSS files - everything in className

---

## Environment Setup

### Required .env.local variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://vawpviatqalicckkqchs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>  # For scripts only
```

### Running the app:

```bash
cd apps/web
npm install
npm run dev  # Runs on localhost:3002
```

### Seeding test data:

```bash
cd apps/web
npm run seed  # Creates test users, vendors, listings, orders
```

Test accounts use `@test.com` emails with password `TestPassword123!`

---

## Git Workflow

### Pre-commit hooks

Husky + lint-staged runs automatically on commit:
- Prettier formats .ts/.tsx/.json/.md/.css files
- ESLint fixes linting issues

Skip with `--no-verify` if needed (emergency only).

### Branch naming

```
feature/<phase-id>-<feature-name>
```

Examples:
- `feature/component-library`
- `feature/seed-data-script`
- `feature/markets-foundation`

### Commit messages

```
feat(scope): Description
fix(scope): Description
docs(scope): Description

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
```

---

## Session Documentation Protocol

**MANDATORY at end of every session:**

1. Create detailed summary: `/docs/Session_Summaries/Phase-X-Feature-YYYY-MM-DD.md`
2. Update `/docs/Session_Summaries/SESSION_LOG.md`
3. Update `/docs/MIGRATION_LOG.md` (if migrations created)
4. Commit and push documentation
5. Report to Tracy with filepaths

See `/docs/Build_Instructions/CC_End_of_Session_Protocol.md` for full template.

---

## Common Tasks

### Creating a new API endpoint

```typescript
// /app/api/[endpoint]/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  // ... query logic
  return NextResponse.json({ data });
}
```

### Creating a database migration

1. Create file: `/supabase/migrations/YYYYMMDD_description.sql`
2. Document in `/docs/MIGRATION_LOG.md`
3. Tracy applies to Dev first, then Staging

### Adding a new component

1. Create in `/apps/web/src/components/`
2. Use TypeScript interfaces for props
3. Mobile-first Tailwind styling
4. Add to test page if reusable

---

## Key Files to Read First

| File | Why |
|------|-----|
| `/docs/PROJECT_CONTEXT.md` | Full architecture overview |
| `/docs/MIGRATION_LOG.md` | Database change history |
| `/docs/Session_Summaries/SESSION_LOG.md` | Recent development progress |
| `/supabase/migrations/20260103_001_initial_schema.sql` | Core database schema |
| `/supabase/migrations/20260109_204341_001_orders_and_payments.sql` | Commerce tables |
| `/apps/web/src/lib/supabase/` | Supabase client setup |

---

## Gotchas & Lessons Learned

1. **vendor_profiles.user_id FK** - References user_profiles.user_id, not user_profiles.id
2. **User profile trigger** - Don't insert user_profiles manually, query the auto-created one
3. **Tailwind not in root** - Tailwind is configured in /apps/web, not repo root
4. **No root package.json** - Husky had to be configured manually
5. **Scripts need dotenv** - Add `import { config } from 'dotenv'; config({ path: '.env.local' });` to load env vars
6. **JSONB for flexibility** - Vertical-specific data uses profile_data and listing_data JSONB columns

---

## Tracy's Preferences

- **Autonomous operation** - Don't ask permission for file ops, commits, pushes. Just do it and report.
- **Documentation** - Always create session summaries and update logs
- **Mobile-first** - Most vendors use phones, design for 375px first
- **Simple solutions** - Avoid over-engineering, keep it straightforward
- **Test before reporting complete** - Verify features work before saying done

---

## Questions? Check These Resources

1. Build Instructions: `/docs/Build_Instructions/`
2. Session history: `/docs/Session_Summaries/`
3. Database changes: `/docs/MIGRATION_LOG.md`
4. Architecture: `/docs/PROJECT_CONTEXT.md`

**When in doubt:** Read the existing code patterns and follow them.
