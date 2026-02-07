# Three-Tier Environment Setup Guide

## Current State
| Tier | Deployment | Supabase Project | Domain |
|------|-----------|------------------|--------|
| Dev | localhost:3002 | Dev (`vawpvi...`) | localhost |
| Staging | Vercel Preview | Staging (`vfknvs...`) | `*.vercel.app` preview URLs |
| Production | Vercel Production | **NEW — create this** | `farmersmarketing.app` |

## Step 1: Create Production Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. **Name:** `inpersonmarketplace-prod` (or similar)
4. **Region:** Pick closest to your users (e.g., `us-east-1` for Texas)
5. **Database password:** Generate and save securely
6. Once created, grab these from **Settings → API**:
   - `Project URL` → this is your production `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → production `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → production `SUPABASE_SERVICE_ROLE_KEY`

## Step 2: Apply Migrations to Production

Run all migrations against the new production project. From your local machine:

```bash
# Option A: Use Supabase CLI (if linked)
supabase db push --db-url postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres

# Option B: Run migration files manually via Supabase SQL Editor
# Go to SQL Editor in the production project dashboard
# Copy and paste each migration file from supabase/migrations/applied/ in order
```

**Migration order matters!** Apply files in chronological order (by filename).

**After applying:** Verify with:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

## Step 3: Configure Vercel Environment Variables

Go to **Vercel Dashboard → Your Project → Settings → Environment Variables**

For each variable below, set it with the correct **scope**:

### Supabase (DIFFERENT per environment)

| Variable | Production Value | Preview Value | Dev Value |
|----------|-----------------|---------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://[PROD_REF].supabase.co` | `https://vfknvsxfgcwqmlkuzhnq.supabase.co` | (use .env.local) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | [prod anon key] | [staging anon key] | (use .env.local) |
| `SUPABASE_SERVICE_ROLE_KEY` | [prod service key] | [staging service key] | (use .env.local) |

**How to scope in Vercel:**
1. Add the variable
2. Uncheck "Production" or "Preview" as needed
3. You'll add the SAME variable name twice — once scoped to Production, once to Preview

### App URL

| Variable | Production | Preview |
|----------|-----------|---------|
| `NEXT_PUBLIC_APP_URL` | `https://farmersmarketing.app` | *(leave unset — auto-detected via NEXT_PUBLIC_VERCEL_URL)* |

### Stripe (test keys for Preview, live keys for Production)

| Variable | Production | Preview |
|----------|-----------|---------|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` | `pk_test_...` |
| `STRIPE_SECRET_KEY` | `sk_live_...` | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | [prod webhook secret] | [test webhook secret] |
| `STRIPE_VENDOR_MONTHLY_PRICE_ID` | [live price ID] | [test price ID] |
| `STRIPE_VENDOR_ANNUAL_PRICE_ID` | [live price ID] | [test price ID] |
| `STRIPE_BUYER_MONTHLY_PRICE_ID` | [live price ID] | [test price ID] |
| `STRIPE_BUYER_ANNUAL_PRICE_ID` | [live price ID] | [test price ID] |

**Note:** You can keep using test Stripe keys for Production initially while testing. Switch to live keys when ready to go live.

### Cron Secret (DIFFERENT per environment for safety)

| Variable | Production | Preview |
|----------|-----------|---------|
| `CRON_SECRET` | [generate: `openssl rand -hex 32`] | [different value] |

**Important:** Vercel cron jobs only execute on the **Production** deployment. Preview deployments don't run crons automatically. This means staging won't expire orders or run activity scans on its own — you'd need to hit those endpoints manually for testing.

### Notifications (add when ready — all commented out for now)

| Variable | Production | Preview |
|----------|-----------|---------|
| `RESEND_API_KEY` | [when ready] | [when ready] |
| `RESEND_FROM_EMAIL` | `notifications@farmersmarketing.app` | `test@farmersmarketing.app` |
| `TWILIO_ACCOUNT_SID` | [when ready] | [test SID] |
| `TWILIO_AUTH_TOKEN` | [when ready] | [test token] |
| `TWILIO_FROM_NUMBER` | [when ready] | [test number] |

## Step 4: Add Domain to Vercel

1. Go to **Vercel Dashboard → Your Project → Settings → Domains**
2. Add `farmersmarketing.app`
3. Add `www.farmersmarketing.app` (redirects to apex)
4. Vercel will show you DNS records to configure

## Step 5: Configure DNS

At your domain registrar (wherever you bought `farmersmarketing.app`):

| Type | Name | Value |
|------|------|-------|
| A | @ | `76.76.21.21` (Vercel's IP) |
| CNAME | www | `cname.vercel-dns.com` |

**Verification:** After DNS propagates (5-60 min), Vercel will auto-provision SSL.

## Step 6: Verify the Setup

### Test Staging (Preview)
1. Push any branch or open a PR
2. Vercel creates a preview deployment
3. Visit the preview URL → should show **yellow "STAGING" banner** at top
4. Should connect to Staging Supabase (your test data)

### Test Production
1. Merge to main (or whatever triggers production deploy)
2. Visit `farmersmarketing.app`
3. Should show **NO banner** (clean production)
4. Should connect to Production Supabase (empty/clean data)

### Verify Isolation
- Create a test record on staging → confirm it does NOT appear on production
- Production should be completely empty until you seed it

## Data Seeding for Production

Production will start with an empty database. You'll need:
1. **Platform admin user** — sign up on production, then promote via SQL:
   ```sql
   UPDATE user_profiles SET role = 'platform_admin' WHERE email = 'your@email.com';
   ```
2. **Vertical record** — the `farmers_market` vertical needs to exist:
   ```sql
   INSERT INTO verticals (id, name, slug, description, is_active)
   VALUES (gen_random_uuid(), 'Farmers Market', 'farmers_market', 'Local farmers markets', true);
   ```
3. **Markets, vendors** — add real data as you onboard

## What Changes in Your Workflow

| Action | Before | After |
|--------|--------|-------|
| Testing features | On staging, visible at vercel.app URL | Same — staging is Preview deployments |
| Breaking things | Could affect "production" (staging) | Safe — production is separate |
| Going live | N/A | Deploy to main → farmersmarketing.app |
| Running crons | Happened on staging | Only on production deployment |
| Stripe payments | All test mode | Test on staging, live on production (when ready) |
